// Rate limiter for the unauthenticated auth endpoints (login/register/forgot/
// reset): in-memory sliding window per client IP per path — suits a
// single-node self-hosted deploy, no external store. Multi-node deploys
// should rate-limit at the reverse proxy instead (and can relax this one via
// NUXT_AUTH_RATE_LIMIT). Keyed on the socket address (not X-Forwarded-For,
// which is client-spoofable when the app is exposed directly); behind a
// reverse proxy the window is effectively instance-wide, which is fine for a
// small-team tool — tune NUXT_AUTH_RATE_LIMIT if needed, 0 disables.
const WINDOW_MS = 60_000
const DEFAULT_MAX = 10
const GUARDED = /^\/api\/auth\/(login|register|forgot|reset)$/

const buckets = new Map<string, number[]>()
let lastSweep = 0

export default defineEventHandler((event) => {
  if (event.method !== 'POST') return
  const path = event.path.split('?')[0] ?? ''
  if (!GUARDED.test(path)) return

  const raw = (useRuntimeConfig(event).authRateLimit ?? '') as string
  const max = raw === '' ? DEFAULT_MAX : Math.max(0, Number.parseInt(raw, 10) || 0)
  if (max === 0) return // explicitly disabled

  const now = Date.now()
  if (now - lastSweep > WINDOW_MS) {
    lastSweep = now
    for (const [key, times] of buckets) {
      if ((times[times.length - 1] ?? 0) < now - WINDOW_MS) buckets.delete(key)
    }
  }

  const ip = getRequestIP(event) ?? 'unknown'
  const key = `${ip} ${path}`
  const times = (buckets.get(key) ?? []).filter(t => t > now - WINDOW_MS)
  if (times.length >= max) {
    const retryAfter = Math.max(1, Math.ceil(((times[0] ?? now) + WINDOW_MS - now) / 1000))
    setHeader(event, 'Retry-After', retryAfter)
    throw createError({ statusCode: 429, message: 'Too many attempts. Try again in a minute.' })
  }
  times.push(now)
  buckets.set(key, times)
})
