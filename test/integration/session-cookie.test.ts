/**
 * Session cookie Secure flag (docs/content/4.reference/4.security.md
 * §Plain HTTP and the Secure flag). nuxt-auth-utils caches one session config
 * and shares it across every Set-Cookie path — login, register, logout,
 * anonymous issue, and the module's own GET/DELETE /api/_auth/session — so one
 * assertion set run against each server proves them all consistent.
 *
 * server/plugins/00.session-cookie.ts accepts true/1/undefined (Secure) and
 * false/0 (not Secure); anything else — including an empty string, which
 * would otherwise silently drop Secure — aborts startup.
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  ApiClient,
  closeTestDb,
  MAIN_URL,
  PORT_SESSION_COOKIE,
  registerAccount,
  startServer,
  type ApiResponse,
  type TestServer
} from '../helpers/server'

/** Set-Cookie lines for the session cookie, out of a raw fetch/ApiClient response. */
const sessionCookieLines = (r: ApiResponse | Response): string[] => {
  const lines
    = 'getSetCookie' in r.headers && typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : []
  return lines.filter(l => l.startsWith('nuxt-session='))
}

const isSecure = (line: string) => /;\s*Secure(\s*;|\s*$)/i.test(line)
const isHttpOnly = (line: string) => /;\s*HttpOnly(\s*;|\s*$)/i.test(line)
const isLax = (line: string) => /;\s*SameSite=Lax(\s*;|\s*$)/i.test(line)
const isRootPath = (line: string) => /;\s*Path=\/(\s*;|\s*$)/i.test(line)

function assertSessionCookie(lines: string[], expectSecure: boolean) {
  expect(lines.length).toBeGreaterThanOrEqual(1)
  for (const line of lines) {
    expect(isSecure(line)).toBe(expectSecure)
    expect(isHttpOnly(line)).toBe(true)
    expect(isLax(line)).toBe(true)
    expect(isRootPath(line)).toBe(true)
  }
}

describe('default (NUXT_SESSION_COOKIE_SECURE unset)', () => {
  it('sets Secure on every session Set-Cookie path', async () => {
    const acct = await registerAccount(MAIN_URL)
    assertSessionCookie(sessionCookieLines(acct.response), true)

    const client = new ApiClient(MAIN_URL)

    const login = await client.post('/api/auth/login', {
      email: acct.email,
      password: acct.password
    })
    expect(login.status).toBe(200)
    assertSessionCookie(sessionCookieLines(login), true)

    // Sanity check: the jar this client built actually authenticates.
    const me = await client.get('/api/me')
    expect(me.status).toBe(200)

    const logout = await client.post('/api/auth/logout')
    assertSessionCookie(sessionCookieLines(logout), true)

    // The module's own handler, called on every UI logout too.
    const secondClient = await (async () => {
      const c = new ApiClient(MAIN_URL)
      await c.post('/api/auth/login', { email: acct.email, password: acct.password })
      return c
    })()
    const moduleDelete = await secondClient.del('/api/_auth/session')
    assertSessionCookie(sessionCookieLines(moduleDelete), true)

    // Anonymous issue path: no cookie sent, server still issues one.
    const anonSession = await fetch(`${MAIN_URL}/api/_auth/session`, { redirect: 'manual' })
    assertSessionCookie(sessionCookieLines(anonSession), true)

    const anonMe = await fetch(`${MAIN_URL}/api/me`, { redirect: 'manual' })
    expect(anonMe.status).toBe(401)
    assertSessionCookie(sessionCookieLines(anonMe), true)
  })
})

describe('NUXT_SESSION_COOKIE_SECURE=false', () => {
  let server: TestServer

  afterAll(async () => {
    await server?.close()
  })

  it('drops Secure everywhere but keeps HttpOnly/SameSite=Lax/Path=/', async () => {
    const acct = await registerAccount(MAIN_URL)
    server = await startServer({
      port: PORT_SESSION_COOKIE,
      env: { NUXT_SESSION_COOKIE_SECURE: 'false' }
    })

    // register.post.ts also calls setUserSession; assert its Set-Cookie directly
    // rather than only relying on it sharing config with the paths below.
    const registerOnThisServer = await registerAccount(server.url)
    assertSessionCookie(sessionCookieLines(registerOnThisServer.response), false)

    const client = new ApiClient(server.url)

    const login = await client.post('/api/auth/login', {
      email: acct.email,
      password: acct.password
    })
    expect(login.status).toBe(200)
    assertSessionCookie(sessionCookieLines(login), false)

    const me = await client.get('/api/me')
    expect(me.status).toBe(200)

    const logout = await client.post('/api/auth/logout')
    assertSessionCookie(sessionCookieLines(logout), false)

    const secondClient = new ApiClient(server.url)
    await secondClient.post('/api/auth/login', { email: acct.email, password: acct.password })
    const moduleDelete = await secondClient.del('/api/_auth/session')
    assertSessionCookie(sessionCookieLines(moduleDelete), false)

    const anonSession = await fetch(`${server.url}/api/_auth/session`, { redirect: 'manual' })
    assertSessionCookie(sessionCookieLines(anonSession), false)

    const anonMe = await fetch(`${server.url}/api/me`, { redirect: 'manual' })
    expect(anonMe.status).toBe(401)
    assertSessionCookie(sessionCookieLines(anonMe), false)
  })

  it('also accepts "0"', async () => {
    await server?.close()
    const acct = await registerAccount(MAIN_URL)
    server = await startServer({
      port: PORT_SESSION_COOKIE,
      env: { NUXT_SESSION_COOKIE_SECURE: '0' }
    })
    const client = new ApiClient(server.url)
    const login = await client.post('/api/auth/login', {
      email: acct.email,
      password: acct.password
    })
    expect(login.status).toBe(200)
    assertSessionCookie(sessionCookieLines(login), false)
  })
})

describe('negative controls (startup refused)', () => {
  it('empty string aborts startup — the silently-dropped-Secure case', async () => {
    // If startServer resolves instead of rejecting — the regression this test
    // exists to catch — close its server rather than leaking it on the port.
    const p = startServer({ port: PORT_SESSION_COOKIE, env: { NUXT_SESSION_COOKIE_SECURE: '' } })
    p.then(s => s.close(), () => {})
    await expect(p).rejects.toThrow(/NUXT_SESSION_COOKIE_SECURE must be "true" or "false"/)
  })

  it('an unrecognized word aborts startup — the silently-ignored case', async () => {
    const p = startServer({ port: PORT_SESSION_COOKIE, env: { NUXT_SESSION_COOKIE_SECURE: 'no' } })
    p.then(s => s.close(), () => {})
    await expect(p).rejects.toThrow(/NUXT_SESSION_COOKIE_SECURE must be "true" or "false"/)
  })

  it('explicit "true" starts and keeps Secure', async () => {
    const acct = await registerAccount(MAIN_URL)
    const server = await startServer({
      port: PORT_SESSION_COOKIE,
      env: { NUXT_SESSION_COOKIE_SECURE: 'true' }
    })
    try {
      const client = new ApiClient(server.url)
      const login = await client.post('/api/auth/login', {
        email: acct.email,
        password: acct.password
      })
      expect(login.status).toBe(200)
      assertSessionCookie(sessionCookieLines(login), true)
    } finally {
      await server.close()
    }
  })
})

afterAll(async () => {
  await closeTestDb()
})
