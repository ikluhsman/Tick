// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vueuse/nuxt', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },
  fonts: {
    families: [
      { name: 'Inter', provider: 'google' },
      { name: 'DM Sans', provider: 'google' },
      { name: 'IBM Plex Sans', provider: 'google' },
      { name: 'Manrope', provider: 'google' },
      { name: 'Source Sans 3', provider: 'google' }
    ]
  },
  runtimeConfig: {
    databaseUrl: '' // NUXT_DATABASE_URL
  }
})
