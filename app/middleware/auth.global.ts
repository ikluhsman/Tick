// Global auth guard (CONTRACTS "Routes"): logged-out users go to /login;
// auth pages stay open (and /login + /register bounce logged-in users home;
// the password-reset pages don't — a logged-in user may follow a reset link).
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  const isAuthPage = to.path === '/login' || to.path === '/register'
  const isResetPage = to.path === '/forgot-password' || to.path === '/reset-password'

  if (isResetPage) return
  if (isAuthPage) {
    if (loggedIn.value) return navigateTo('/')
    return
  }
  if (!loggedIn.value) return navigateTo('/login')
})
