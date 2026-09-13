/**
 * Auth rate limiting (docs/content/4.reference/4.security.md §Rate limiting):
 * POST to each auth endpoint is capped per IP per minute; over the limit the
 * server answers 429 with a Retry-After header.
 *
 * This file runs its own server on :3802 with NUXT_AUTH_RATE_LIMIT=3 so the
 * burst is short and deterministic, and so exhausting a bucket here can never
 * affect the shared server the rest of the suite logs in against.
 *
 * The limiter buckets on the socket's remote address, so each case dials from
 * its own loopback source address (127.0.0.x) — that keeps the cases
 * independent without waiting on anything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeTestDb,
  MAIN_URL,
  PORT_RATE_LIMIT,
  registerAccount,
  requestFromIp,
  sleep,
  startServer,
  uniqueEmail,
  type TestAccount,
  type TestServer
} from '../helpers/server'

const BURST = 3
const WINDOW_MS = 60_000

let server: TestServer
let acct: TestAccount

beforeAll(async () => {
  // The account is created on the shared server (same TEST database), so no
  // register call is spent against the limited server's own bucket.
  acct = await registerAccount(MAIN_URL)
  server = await startServer({
    port: PORT_RATE_LIMIT,
    env: { NUXT_AUTH_RATE_LIMIT: String(BURST) }
  })
}, 120_000)

afterAll(async () => {
  await server?.close()
  await closeTestDb()
})

const login = (localAddress: string, password: string) =>
  requestFromIp({
    port: PORT_RATE_LIMIT,
    path: '/api/auth/login',
    localAddress,
    body: { email: acct.email, password }
  })

describe('POST /api/auth/login rate limit', () => {
  it('allows the configured burst, then 429s with Retry-After', async () => {
    const ip = '127.0.0.21'
    for (let i = 0; i < BURST; i++) {
      const res = await login(ip, 'wrong-password')
      expect(`attempt ${i}: ${res.status}`).toBe(`attempt ${i}: 401`)
    }

    const limited = await login(ip, 'wrong-password')
    expect(limited.status).toBe(429)
    expect(limited.text).toMatch(/too many attempts/i)

    const retryAfter = Number(limited.headers['retry-after'])
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(WINDOW_MS / 1000)

    // Correct credentials are refused too — the limiter runs before the handler.
    const correct = await login(ip, acct.password)
    expect(correct.status).toBe(429)
  })

  it('buckets per client IP', async () => {
    const noisy = '127.0.0.22'
    for (let i = 0; i < BURST + 1; i++) await login(noisy, 'wrong-password')
    expect((await login(noisy, acct.password)).status).toBe(429)

    // A different source address is unaffected.
    const quiet = await login('127.0.0.23', acct.password)
    expect(quiet.status).toBe(200)
  })

  it('buckets per endpoint', async () => {
    const ip = '127.0.0.24'
    for (let i = 0; i < BURST + 1; i++) await login(ip, 'wrong-password')
    expect((await login(ip, acct.password)).status).toBe(429)

    // /api/auth/forgot has its own window for the same IP.
    const forgot = await requestFromIp({
      port: PORT_RATE_LIMIT,
      path: '/api/auth/forgot',
      localAddress: ip,
      body: { email: uniqueEmail('nobody') }
    })
    expect(forgot.status).toBe(200)
    expect(JSON.parse(forgot.text)).toEqual({ ok: true })
  })

  it(
    'lets a legitimate login through again once the window has passed',
    async () => {
      const ip = '127.0.0.25'
      for (let i = 0; i < BURST; i++) await login(ip, 'wrong-password')
      const blocked = await login(ip, acct.password)
      expect(blocked.status).toBe(429)
      const retryAfter = Number(blocked.headers['retry-after'])

      // Wait exactly as long as the server told us to, plus a second of slack.
      await sleep(retryAfter * 1000 + 1000)

      const allowed = await login(ip, acct.password)
      expect(allowed.status).toBe(200)
      expect(JSON.parse(allowed.text).email).toBe(acct.email)
    },
    WINDOW_MS + 60_000
  )
})

describe('NUXT_AUTH_RATE_LIMIT=0', () => {
  it('disables the limiter entirely (the shared server never 429s)', async () => {
    const ip = '127.0.0.26'
    for (let i = 0; i < BURST * 3; i++) {
      const res = await requestFromIp({
        port: Number(new URL(MAIN_URL).port),
        path: '/api/auth/login',
        localAddress: ip,
        body: { email: acct.email, password: 'wrong-password' }
      })
      expect(`attempt ${i}: ${res.status}`).toBe(`attempt ${i}: 401`)
    }
  })
})
