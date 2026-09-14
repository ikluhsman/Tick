// Validates the session cookie's Secure flag (runtimeConfig.session.cookie.secure,
// env NUXT_SESSION_COOKIE_SECURE) before the server takes traffic.
// Nitro parses env values with destr: "true"/"false" → boolean, "1"/"0" → number, but ""
// and any other word stay strings. h3 emits Secure for any truthy value, so "no"/"off"
// would silently KEEP Secure and "" would silently DROP it. Refuse to boot on anything
// ambiguous instead of guessing. Keep this plugin synchronous: Nitro rethrows a sync
// plugin error and startup aborts; an async rejection would only be logged.
export default defineNitroPlugin(() => {
  const value: unknown = useRuntimeConfig().session?.cookie?.secure
  if (value === true || value === 1 || value === undefined) return // undefined → h3 default (Secure)
  if (value === false || value === 0) {
    console.warn('[tick] NUXT_SESSION_COOKIE_SECURE=false — the session cookie is sent without the Secure flag, i.e. in cleartext over plain HTTP. Only acceptable on a network you fully trust; prefer HTTPS (docs: Security → Plain HTTP and the Secure flag).')
    return
  }
  const raw = process.env.NITRO_SESSION_COOKIE_SECURE ?? process.env.NUXT_SESSION_COOKIE_SECURE
  throw new Error(`[tick] NUXT_SESSION_COOKIE_SECURE must be "true" or "false" (got ${JSON.stringify(raw ?? value)}). Unset it to keep the secure default.`)
})
