import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * Shared unit-test config for Tick.
 *
 * Plain Vite/Vitest — no Nuxt runtime — so the suite stays fast and
 * deterministic. Targets are pure modules imported by path (auto-imports do
 * not exist here). A spec that genuinely needs a DOM opts in per file with
 * a docblock: `// @vitest-environment happy-dom`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '~~': root,
      '@@': root,
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],
    // Playwright owns test/e2e — keep Vitest out of it.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**', '**/.output/**', 'test/e2e/**']
  }
})
