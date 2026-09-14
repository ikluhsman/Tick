// PM2 config for running Tick natively (after `npm ci && npm run build`).
// Start with:   pm2 start ecosystem.config.cjs
// Environment: PM2 inherits your shell env; set the NUXT_* vars there (or in a
// systemd/pm2 env file) rather than committing secrets here.
//
//   NUXT_DATABASE_URL      required — postgresql://user:pass@host:5432/tick
//   NUXT_SESSION_PASSWORD  required — 32+ random chars (`openssl rand -base64 36`)
//   NUXT_AUTO_MIGRATE      optional — 'false' to skip startup SQL migrations
//   NUXT_SESSION_COOKIE_SECURE optional — 'false' only for plain-HTTP LAN access (docs: Security). Empty/other values abort startup.
//   NITRO_HOST / NITRO_PORT optional — bind address/port (defaults below)
module.exports = {
  apps: [
    {
      name: 'tick',
      script: '.output/server/index.mjs',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        NITRO_HOST: '0.0.0.0',
        NITRO_PORT: '3000'
      }
    }
  ]
}
