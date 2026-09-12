// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vueuse/nuxt', 'nuxt-auth-utils', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      // viewport-fit=cover so env(safe-area-inset-*) works inside the standalone PWA
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      link: [
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Tick' },
        // Static PWA chrome color — Nocturne bg; manifest/meta hex is exempt from the no-hex rule
        { name: 'theme-color', content: '#161826' }
      ]
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Tick',
      short_name: 'Tick',
      description: 'Self-hosted time tracking',
      display: 'standalone',
      start_url: '/',
      // Static manifest colors (Nocturne bg) — exempt from the no-hex rule
      theme_color: '#161826',
      background_color: '#161826',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    // Default generateSW: precache the built app shell only; API stays network-only
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      navigateFallback: null
    },
    // Dev serves manifest + icons only; the service worker is a prod-build
    // artifact (devOptions' generated dev SW 500s under the Nuxt vite setup).
    devOptions: {
      enabled: false
    }
  },
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
    databaseUrl: '', // NUXT_DATABASE_URL
    // SMTP (all optional — mail degrades gracefully when unset, see server/utils/mail.ts)
    smtpHost: '', // NUXT_SMTP_HOST
    smtpPort: '', // NUXT_SMTP_PORT
    smtpUser: '', // NUXT_SMTP_USER
    smtpPass: '', // NUXT_SMTP_PASS
    smtpSecure: '', // NUXT_SMTP_SECURE ('true' = implicit TLS, usually port 465)
    mailFrom: '', // NUXT_MAIL_FROM (e.g. "Tick <tick@example.com>")
    demoMode: false, // NUXT_DEMO_MODE — hourly reset plugin + demo guards
    public: {
      demoMode: false // NUXT_PUBLIC_DEMO_MODE — shows the demo banner
    }
  }
})
