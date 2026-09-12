// Strip the 'x-powered-by: Nuxt' header the page renderer adds (minor
// tech-stack disclosure). Security headers themselves live in
// server/middleware/02.security-headers.ts.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    if (response.headers) {
      delete response.headers['x-powered-by']
      delete response.headers['X-Powered-By']
    }
  })
})
