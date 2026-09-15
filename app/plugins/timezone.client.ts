// Tell the server which timezone to render in (ticktimer/Tick#7).
//
// Writes the browser's IANA zone to the cookie SSR reads. On every load, not
// just at login, so a travelling user is correct from their next navigation.
//
// The correction is deferred to `app:suspense:resolve` on purpose. Plugins run
// *before* the hydration render, and changing the zone there would make the
// client's first render disagree with the server's HTML — the exact mismatch
// this is meant to remove. `app:mounted` is not late enough either: every page
// here has a top-level await, so it hydrates inside Suspense and the root is
// already "mounted" while the page's own DOM is still being hydrated against
// this value. Once Suspense resolves it is an ordinary reactive update: the
// handful of labels rendered from the server's fallback zone re-render once, and
// every later request carries the cookie and is server-rendered correctly.
export default defineNuxtPlugin((nuxtApp) => {
  const browser = runtimeTimeZone()
  if (!isValidTimeZone(browser)) return

  nuxtApp.hook('app:suspense:resolve', () => {
    const cookie = useTimeZoneCookie()
    if (cookie.value !== browser) cookie.value = browser
    const timeZone = useState<string>(TZ_STATE)
    if (timeZone.value !== browser) timeZone.value = browser
  })
})
