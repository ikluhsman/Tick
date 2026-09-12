// demoGuard(event) — 403s destructive account/org mutations while the
// instance runs in demo mode (NUXT_DEMO_MODE=true). Dropped as a one-liner
// into: PATCH /api/me/password, PATCH /api/org, DELETE /api/org/members/:id.
import type { H3Event } from 'h3'

export function demoGuard(event: H3Event): void {
  if (useRuntimeConfig(event).demoMode) {
    throw createError({ statusCode: 403, statusMessage: 'Disabled in demo' })
  }
}
