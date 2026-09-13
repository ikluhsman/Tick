// Builds the app for the integration suite into an ISOLATED build/output dir
// (.nuxt/it/*) so it never touches the .nuxt/.output the running dev server
// owns. Invoked as a child process from test/helpers/server.ts (buildOnce()),
// and runnable by hand: `node test/integration/build-app.mjs`.
//
// NUXT_DATABASE_URL is pinned to the TEST database for the build as well as at
// runtime — the built server also reads it from process.env on boot, so the
// baked default can never point at the dev database.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { buildNuxt, loadNuxt } from '@nuxt/kit'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const BUILD_DIR = resolve(ROOT, '.nuxt/it/build')
const OUTPUT_DIR = resolve(ROOT, '.nuxt/it/output')

process.env.NUXT_DATABASE_URL
  = process.env.NUXT_DATABASE_URL
    ?? 'postgresql://tick:tick_dev_password@localhost:5432/tick_test'

const nuxt = await loadNuxt({
  cwd: ROOT,
  dev: false,
  overrides: {
    buildDir: BUILD_DIR,
    nitro: { output: { dir: OUTPUT_DIR } }
  }
})

await buildNuxt(nuxt)
await nuxt.close()
console.log(`[it] build ready: ${OUTPUT_DIR}`)
