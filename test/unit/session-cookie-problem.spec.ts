import { describe, expect, it } from 'vitest'
import { sessionCookieProblem } from '../../app/utils/sessionCookieProblem'

const ctx = (secureContext: boolean) => ({ secureContext, host: 'tick.example:3000' })

describe('sessionCookieProblem', () => {
  it('returns null when the session carries a user, in either context', () => {
    expect(sessionCookieProblem({ user: { id: 'u1' } }, 'signin', ctx(true))).toBeNull()
    expect(sessionCookieProblem({ user: { id: 'u1' } }, 'signin', ctx(false))).toBeNull()
  })

  it('reports a failed session fetch when the session is null, in either context', () => {
    expect(sessionCookieProblem(null, 'signin', ctx(true))).toMatch(/loading your session failed/)
    // A null session (fetch itself failed) must win over the secureContext check,
    // regardless of context — there's no cookie evidence to read a context branch from.
    expect(sessionCookieProblem(null, 'signin', ctx(false))).toMatch(/loading your session failed/)
  })

  it('reports the plain-HTTP cause, naming the host and the remediation, when the context is insecure', () => {
    const msg = sessionCookieProblem({}, 'signin', ctx(false))
    expect(msg).toMatch(/plain HTTP/)
    expect(msg).toContain('tick.example:3000')
    expect(msg).toContain('https://')
    expect(msg).toContain('NUXT_SESSION_COOKIE_SECURE=false')
    expect(msg).toMatch(/clear this site's cookies/)
  })

  it('reports the generic cookie-blocking cause, with its remediation, when the context is secure', () => {
    const msg = sessionCookieProblem({}, 'signin', ctx(true))
    expect(msg).toMatch(/Allow cookies/)
    expect(msg).toMatch(/try again/)
  })

  it('uses the account-created lead for register', () => {
    const msg = sessionCookieProblem({}, 'account', ctx(true))
    expect(msg).toMatch(/^Your account was created, but/)
  })

  it('uses the password-accepted lead for login', () => {
    const msg = sessionCookieProblem({}, 'signin', ctx(true))
    expect(msg).toMatch(/^Your password was accepted, but/)
  })
})
