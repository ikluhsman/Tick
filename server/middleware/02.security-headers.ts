// Security headers on every response (pages, assets, API). HSTS is left to
// the TLS-terminating reverse proxy, per .env.example. CSP notes:
// - 'unsafe-inline' script/style is required by Nuxt's inline payload +
//   Vue/Tailwind inline styles; no external script hosts are allowed.
// - fonts.googleapis.com/gstatic.com cover @nuxt/fonts fallback fetches.
// - Dev only: HMR needs ws: and the devtools iframe needs same-origin framing.
const FRAME = import.meta.dev ? "'self'" : "'none'"
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${import.meta.dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self'${import.meta.dev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${FRAME}`
].join('; ')

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Security-Policy': CSP,
    'X-Frame-Options': import.meta.dev ? 'SAMEORIGIN' : 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  })
})
