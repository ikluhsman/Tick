// Global request-body cap for API mutations: 1MB, 413 beyond it.
// /api/import/* is exempt — those routes enforce their own 5MB cap inside
// (IMPORT_MAX_BYTES in server/utils/import/plan.ts).
//
// Declared Content-Length is checked up front. Bodies without one (chunked
// transfer) could smuggle any size past that check, so a length is required
// on API mutations instead of trusting the stream — every JSON client the
// app uses ($fetch, curl -d, browsers) always sends Content-Length; bodyless
// requests (no Content-Length, no Transfer-Encoding) pass untouched.
const MAX_BODY_BYTES = 1024 * 1024 // 1MB
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (!BODY_METHODS.has(event.method)) return
  const path = event.path.split('?')[0] ?? ''
  if (!path.startsWith('/api/') || path.startsWith('/api/import/')) return

  const declared = getHeader(event, 'content-length')
  if (declared !== undefined) {
    const len = Number.parseInt(declared, 10)
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Request body too large' })
    }
    return
  }
  if ((getHeader(event, 'transfer-encoding') ?? '').toLowerCase().includes('chunked')) {
    throw createError({ statusCode: 411, statusMessage: 'Length Required' })
  }
})
