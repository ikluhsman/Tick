// Restore the persisted theme (localStorage `tick-theme`) before first paint on the client.
// Server-stored theme (users.theme jsonb) is applied via themeStore.load(saved) after login.
export default defineNuxtPlugin(() => {
  const theme = useThemeStore()
  theme.load()
})
