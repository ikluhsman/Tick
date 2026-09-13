/**
 * Auth contracts (docs/content/4.reference/2.api.md §Auth, 4.security.md).
 * Runs against the shared server on :3801 (rate limiter disabled there — the
 * limiter has its own server in rate-limit.test.ts).
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  ApiClient,
  closeTestDb,
  loginAs,
  MAIN_URL,
  registerAccount,
  schema,
  testDb,
  uniqueEmail,
  type SessionUserLike
} from '../helpers/server'
import { and, desc, eq, isNull } from 'drizzle-orm'

afterAll(async () => {
  await closeTestDb()
})

/** Newest reset token for a user, straight out of the TEST database. */
async function latestResetToken(userId: string) {
  const [row] = await testDb()
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, userId))
    .orderBy(desc(schema.passwordResetTokens.createdAt))
    .limit(1)
  return row
}

describe('POST /api/auth/register', () => {
  it('creates user + personal org + owner membership and sets a session', async () => {
    const client = new ApiClient(MAIN_URL)
    const email = uniqueEmail('register')
    const res = await client.post<SessionUserLike>('/api/auth/register', {
      name: 'Ada Lovelace',
      email,
      password: 'correct horse battery'
    })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      name: 'Ada Lovelace',
      email,
      defaultRate: null,
      orgName: "Ada's workspace",
      role: 'owner'
    })
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.orgId).toMatch(/^[0-9a-f-]{36}$/)

    // Session cookie is set, sealed and http-only.
    const setCookie = res.headers.getSetCookie().join('\n')
    expect(setCookie).toMatch(/nuxt-session=/)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(client.hasCookie('nuxt-session')).toBe(true)

    // …and the rows really exist in the TEST database.
    const db = testDb()
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, res.body.id) })
    expect(user?.email).toBe(email)
    expect(user?.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/) // salt:hex scrypt
    expect(user?.passwordHash).not.toContain('correct horse battery')
    expect(user?.sessionVersion).toBe(0)

    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, res.body.orgId) })
    expect(org?.name).toBe("Ada's workspace")

    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(schema.orgMembers.orgId, res.body.orgId),
        eq(schema.orgMembers.userId, res.body.id)
      )
    })
    expect(membership?.role).toBe('owner')

    // The session actually works.
    const me = await client.get<SessionUserLike>('/api/me')
    expect(me.status).toBe(200)
    expect(me.body.id).toBe(res.body.id)
  })

  it('409s a duplicate email without leaking anything else', async () => {
    const acct = await registerAccount()
    const res = await new ApiClient(MAIN_URL).post('/api/auth/register', {
      name: 'Impostor',
      email: acct.email,
      password: 'another-password'
    })
    expect(res.status).toBe(409)
    expect(res.body.message ?? res.body.statusMessage).toMatch(/already exists/i)
  })

  it('400s a short password with field names only (no zod internals)', async () => {
    const res = await new ApiClient(MAIN_URL).post('/api/auth/register', {
      name: 'Shorty',
      email: uniqueEmail('short'),
      password: 'tiny'
    })
    expect(res.status).toBe(400)
    expect(res.body.statusMessage).toBe('Invalid input')
    expect(res.body.data).toEqual({ fields: ['password'] })
    expect(res.text).not.toMatch(/zod|expected|too_small/i)
  })
})

describe('POST /api/auth/login + logout', () => {
  it('sets a session that /api/me accepts', async () => {
    const acct = await registerAccount()
    const fresh = new ApiClient(MAIN_URL)
    const res = await fresh.post<SessionUserLike>('/api/auth/login', {
      email: acct.email,
      password: acct.password
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: acct.user.id,
      email: acct.email,
      orgId: acct.user.orgId,
      role: 'owner'
    })
    expect(fresh.hasCookie('nuxt-session')).toBe(true)
    expect((await fresh.get('/api/me')).status).toBe(200)
  })

  it('answers one generic 401 for a wrong password and an unknown email', async () => {
    const acct = await registerAccount()
    const wrongPw = await new ApiClient(MAIN_URL).post('/api/auth/login', {
      email: acct.email,
      password: 'not-the-password'
    })
    const unknown = await new ApiClient(MAIN_URL).post('/api/auth/login', {
      email: uniqueEmail('ghost'),
      password: 'not-the-password'
    })
    expect(wrongPw.status).toBe(401)
    expect(unknown.status).toBe(401)
    // Identical message — no account enumeration.
    expect(wrongPw.body.message).toBe(unknown.body.message)
    expect(wrongPw.body.message).toMatch(/invalid email or password/i)
  })

  it('logout invalidates the session cookie', async () => {
    const acct = await registerAccount()
    expect((await acct.client.get('/api/me')).status).toBe(200)

    const out = await acct.client.post('/api/auth/logout')
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ ok: true })
    expect(acct.client.hasCookie('nuxt-session')).toBe(false)

    expect((await acct.client.get('/api/me')).status).toBe(401)
  })

  it('401s /api/me with no session at all', async () => {
    expect((await new ApiClient(MAIN_URL).get('/api/me')).status).toBe(401)
  })
})

describe('password reset flow', () => {
  it('forgot → token → reset; old password 401, new password 200, reuse 410', async () => {
    const acct = await registerAccount()
    const anon = new ApiClient(MAIN_URL)

    // Unknown address: identical generic response, no token row anywhere.
    const ghost = await anon.post('/api/auth/forgot', { email: uniqueEmail('ghost') })
    expect(ghost.status).toBe(200)
    expect(ghost.body).toEqual({ ok: true })

    const asked = await anon.post('/api/auth/forgot', { email: acct.email })
    expect(asked.status).toBe(200)
    expect(asked.body).toEqual({ ok: true })
    // The response itself never carries the token.
    expect(asked.text).not.toMatch(/token/i)

    const row = await latestResetToken(acct.user.id)
    expect(row).toBeTruthy()
    expect(row!.usedAt).toBeNull()
    expect(row!.token).toHaveLength(48) // 36 random bytes, base64url
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 5_000)

    // A bogus token is 410, not 404/500.
    const bogus = await anon.post('/api/auth/reset', {
      token: 'definitely-not-a-real-token',
      password: 'brand-new-password'
    })
    expect(bogus.status).toBe(410)

    const newPassword = 'brand-new-password-9'
    const reset = await anon.post('/api/auth/reset', { token: row!.token, password: newPassword })
    expect(reset.status).toBe(200)
    expect(reset.body).toEqual({ ok: true })

    // Old password no longer works; new one does.
    const old = await new ApiClient(MAIN_URL).post('/api/auth/login', {
      email: acct.email,
      password: acct.password
    })
    expect(old.status).toBe(401)

    const fresh = await new ApiClient(MAIN_URL).post('/api/auth/login', {
      email: acct.email,
      password: newPassword
    })
    expect(fresh.status).toBe(200)

    // Single use: the same token is gone for good.
    const reuse = await anon.post('/api/auth/reset', {
      token: row!.token,
      password: 'yet-another-password'
    })
    expect(reuse.status).toBe(410)
  })

  it('voids the user other outstanding reset tokens', async () => {
    const acct = await registerAccount()
    const anon = new ApiClient(MAIN_URL)
    await anon.post('/api/auth/forgot', { email: acct.email })
    const first = await latestResetToken(acct.user.id)
    await anon.post('/api/auth/forgot', { email: acct.email })
    const second = await latestResetToken(acct.user.id)
    expect(second!.token).not.toBe(first!.token)

    const used = await anon.post('/api/auth/reset', {
      token: second!.token,
      password: 'rotated-password-1'
    })
    expect(used.status).toBe(200)

    // The older, never-used token was voided in the same transaction.
    const stillOpen = await testDb()
      .select({ id: schema.passwordResetTokens.id })
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.userId, acct.user.id),
          isNull(schema.passwordResetTokens.usedAt)
        )
      )
    expect(stillOpen).toHaveLength(0)

    const replay = await anon.post('/api/auth/reset', {
      token: first!.token,
      password: 'should-not-work-1'
    })
    expect(replay.status).toBe(410)
  })
})

describe('session_version revocation', () => {
  it('a password reset kills every live session (both, not just one)', async () => {
    const acct = await registerAccount()
    const sessionA = acct.client
    const sessionB = await loginAs(acct.email, acct.password)

    expect((await sessionA.get('/api/me')).status).toBe(200)
    expect((await sessionB.get('/api/me')).status).toBe(200)

    const before = await testDb().query.users.findFirst({
      where: eq(schema.users.id, acct.user.id)
    })

    const anon = new ApiClient(MAIN_URL)
    await anon.post('/api/auth/forgot', { email: acct.email })
    const row = await latestResetToken(acct.user.id)
    const reset = await anon.post('/api/auth/reset', {
      token: row!.token,
      password: 'revocation-password-1'
    })
    expect(reset.status).toBe(200)

    const after = await testDb().query.users.findFirst({
      where: eq(schema.users.id, acct.user.id)
    })
    expect(after!.sessionVersion).toBe(before!.sessionVersion + 1)

    // Both pre-reset sessions die on their next request.
    expect((await sessionA.get('/api/me')).status).toBe(401)
    expect((await sessionB.get('/api/me')).status).toBe(401)
    // …and the cookie is cleared server-side, not just rejected.
    expect(sessionA.hasCookie('nuxt-session')).toBe(false)

    // A session minted after the reset works.
    const sessionC = await loginAs(acct.email, 'revocation-password-1')
    expect((await sessionC.get('/api/me')).status).toBe(200)
  })

  it('a password change keeps the current session and kills the others', async () => {
    const acct = await registerAccount()
    const other = await loginAs(acct.email, acct.password)

    const changed = await acct.client.patch('/api/me/password', {
      currentPassword: acct.password,
      newPassword: 'changed-password-1'
    })
    expect(changed.status).toBe(200)

    expect((await acct.client.get('/api/me')).status).toBe(200)
    expect((await other.get('/api/me')).status).toBe(401)
  })

  it('403s a password change with the wrong current password', async () => {
    const acct = await registerAccount()
    const res = await acct.client.patch('/api/me/password', {
      currentPassword: 'wrong-current-password',
      newPassword: 'whatever-password-1'
    })
    expect(res.status).toBe(403)
  })
})
