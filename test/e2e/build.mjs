// Production build for the e2e suite.
//
// Why not `npm run build`? `nuxt build` clears and locks the shared `.nuxt`
// buildDir, which would tear the running dev server (port 3790) out from under
// itself. This drives @nuxt/kit directly with an isolated buildDir + Nitro
// output dir under test/e2e/.cache (gitignored), so the dev server never
// notices the e2e suite exists.
//
// The PWA service worker is disabled for the e2e build: an auto-updating SW
// re-registering in every fresh browser context is pure flake and none of the
// flows under test involve it.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
export const ROOT = resolve(here, '../..')
export const BUILD_DIR = join(here, '.cache/build')
export const OUTPUT_DIR = join(here, '.cache/output')
export const SERVER_ENTRY = join(OUTPUT_DIR, 'server/index.mjs')

/** Newest mtime across the app sources that end up in the bundle. */
function sourceMtime() {
  const roots = [
    'app',
    'server',
    'shared',
    'public',
    'nuxt.config.ts',
    'package.json',
    'app.config.ts',
    'test/e2e/build.mjs'
  ]
  let newest = 0
  const walk = (p) => {
    let st
    try {
      st = statSync(p)
    } catch {
      return
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        walk(join(p, name))
      }
      return
    }
    if (st.mtimeMs > newest) newest = st.mtimeMs
  }
  for (const r of roots) walk(join(ROOT, r))
  return newest
}

/** True when .cache/output is missing or older than the newest source file. */
export function isStale() {
  if (process.env.E2E_FORCE_BUILD === '1') return true
  if (!existsSync(SERVER_ENTRY)) return true
  return statSync(SERVER_ENTRY).mtimeMs < sourceMtime()
}

export async function buildApp() {
  process.env.NODE_ENV = 'production'
  const { loadNuxt, buildNuxt } = await import('@nuxt/kit')
  const nuxt = await loadNuxt({
    cwd: ROOT,
    ready: false,
    overrides: {
      buildDir: BUILD_DIR,
      devtools: { enabled: false },
      pwa: { disable: true },
      nitro: { output: { dir: OUTPUT_DIR } },
      // h3 marks the session cookie Secure in a production build. The suite
      // talks plain http to 127.0.0.1; Playwright's APIRequestContext will not
      // send a Secure cookie over http, so the API-driven setup/cleanup
      // helpers would run unauthenticated. Baked into the e2e bundle only —
      // this key does not exist in runtimeConfig, so it cannot be set from the
      // environment at runtime. Nothing under test asserts on cookie flags.
      runtimeConfig: { session: { cookie: { secure: false } } }
    }
  })
  await nuxt.ready()
  await buildNuxt(nuxt)
  await nuxt.close()
}

/** Build in a child process (keeps Nuxt's build-time globals out of the server process). */
export function buildIfStale() {
  if (!isStale()) {
    console.log('[e2e] reusing existing build in test/e2e/.cache/output')
    return
  }
  console.log('[e2e] building the app into test/e2e/.cache/output …')
  execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--build'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  })
}

if (process.argv.includes('--build')) await buildApp()
