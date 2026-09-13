// Restore the persisted theme on both sides of the render: on the server from
// the `tick-theme` cookie (so SSR paints the saved mode/starfield/colors and
// hydration finds no mismatch), on the client from the same cookie with the
// localStorage mirror as a fallback. Server-stored theme (users.theme jsonb)
// is applied on login, which also refreshes the cookie for later SSR loads.
export default defineNuxtPlugin(() => {
  const theme = useThemeStore()
  theme.load()
})
