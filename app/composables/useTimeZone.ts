// The one timezone both renders agree on (ticktimer/Tick#7).
//
// The server cannot know the browser's zone, so the browser writes it to a
// cookie and SSR reads it back. Two cases, and neither may mismatch:
//
//   cookie present  — the normal case after a first visit. SSR formats in the
//                     browser's zone, hydration matches, nothing re-renders.
//   cookie absent   — a cold browser. SSR falls back to its own zone and ships
//                     that value in the payload, so the client's *hydration*
//                     render uses the same one and still matches. The plugin
//                     then corrects it after mount (see plugins/timezone.client),
//                     which is an ordinary reactive update, not a mismatch.
//
// The value lives in useState rather than being recomputed per call precisely so
// the client hydrates with the server's choice instead of its own.

export const TZ_COOKIE = 'tick_tz'
export const TZ_STATE = 'tick-time-zone'

/** The cookie SSR reads and the client plugin writes. */
export function useTimeZoneCookie() {
  // Not httpOnly — the client writes it. Nothing security-sensitive hangs off
  // it: an invalid value is rejected below and we fall back to the server's
  // zone, which is exactly the behaviour this replaced.
  return useCookie<string | null>(TZ_COOKIE, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })
}

export function useTimeZone() {
  const cookie = useTimeZoneCookie()
  const timeZone = useState<string>(TZ_STATE, () =>
    isValidTimeZone(cookie.value) ? cookie.value : runtimeTimeZone()
  )

  /** `zonedDate` bound to that zone — what call sites actually want. */
  const zoned = (d: Date | string | number) => zonedDate(d, timeZone.value)

  return { timeZone, zoned, cookie }
}
