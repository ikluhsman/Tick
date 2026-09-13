// Tick documentation site — separate Nuxt app (docs/), Nuxt UI + Nuxt Content.
// Visually kin to the main app: dark default, violet primary, Inter.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/content'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    // Cookie, not localStorage, so SSR knows the visitor's saved mode and
    // renders the right <html> class on the first byte (same as the main app).
    // Note: this site still logs a hydration mismatch from somewhere else —
    // unrelated to the stored mode, still unidentified.
    storage: 'cookie'
  },
  fonts: {
    families: [{ name: 'Inter', provider: 'google' }]
  },
  app: {
    head: {
      title: 'Tick docs',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  }
})
