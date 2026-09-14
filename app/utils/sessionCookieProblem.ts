/** After a 2xx login/register, explain why the session still has no user (null = fine). */
export function sessionCookieProblem(
  session: { user?: unknown } | null,
  accepted: 'signin' | 'account',
  ctx: { secureContext: boolean, host: string }
): string | null {
  if (session?.user) return null
  const lead = accepted === 'account' ? 'Your account was created, but' : 'Your password was accepted, but'
  // nuxt-auth-utils fetch() stores null when GET /api/_auth/session itself failed
  if (session === null) return `${lead} loading your session failed. Reload the page and sign in again.`
  // Browsers store Secure cookies only in a secure context (https:, localhost, 127.x, [::1])
  if (!ctx.secureContext)
    return `${lead} your browser refused the sign-in cookie because this page is plain HTTP (${ctx.host}). `
      + 'Open Tick over https://, or ask your server admin to set NUXT_SESSION_COOKIE_SECURE=false (trusted networks only). '
      + 'If that is already set, clear this site\'s cookies — a cookie left from an earlier https:// visit blocks plain-HTTP sign-in.'
  return `${lead} your browser didn't keep the sign-in cookie. Allow cookies for this site (check private-browsing or cookie-blocking settings) and try again.`
}
