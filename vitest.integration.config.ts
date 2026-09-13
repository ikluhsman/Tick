// Integration suite config — separate from vitest.config.ts (unit tests) on
// purpose: these boot a REAL built Nitro server against the TEST database.
//
//   npx vitest run --config vitest.integration.config.ts
//
// The unit config must exclude `test/integration/**`.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    // One server, many files: run files serially so no two suites race on the
    // same HTTP server or on the auth rate-limit buckets.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 30_000,
    // The first run builds the app (can take a few minutes on a cold cache).
    hookTimeout: 600_000,
    teardownTimeout: 30_000,
    retry: 0,
    sequence: { shuffle: false }
  }
})
