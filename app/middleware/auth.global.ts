// Global auth guard (CONTRACTS "Routes"): logged-out users go to /login;
// /login and /register stay open (and bounce logged-in users home).
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  const isAuthPage = to.path === '/login' || to.path === '/register'

  if (isAuthPage) {
    if (loggedIn.value) return navigateTo('/')
    return
  }
  if (!loggedIn.value) return navigateTo('/login')
})
