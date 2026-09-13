// Regression guard for the client-avatar swatch ink (`.tick-on-swatch` in
// app/assets/css/main.css) — CSS can't be unit-tested, so this is the
// coverage that replaced the old `clientColorInk()` JS unit tests.
//
// CLIENT_COLOR_PALETTE (server/utils/entry-dto.ts) draws from whichever
// primary (17 choices) and neutral (9 choices) the signed-in user has
// picked, in either color mode — the ink has to hold up for all of it, not
// just the two shipped presets' primary/neutral. This drives every primary
// and every neutral through the real Settings → Appearance editor (the same
// controls a person uses) and asserts ≥4.5:1, computed in-page from
// `getComputedStyle` — much faster than a full axe run per combination, and
// deterministic in a way that reading real /clients avatars wouldn't be
// (seeded client ids are DB-generated per seed run, so which of the four
// palette entries actually show up among the three seeded clients isn't
// stable — the test targets the four known tokens directly instead).
//
// Every primary only ever changes primary-400/primary-600, and every
// neutral only ever changes neutral-400 (secondary-600 is always blue,
// unaffected by either) — so sweeping "every primary × a fixed neutral"
// plus "every neutral × a fixed primary" gives the same coverage as the
// full 17×9 cross product without 150+ extra no-op combinations.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// Mirrors app/stores/theme.ts's THEME_PRIMARIES / THEME_NEUTRALS —
// duplicated because e2e specs run outside Nuxt's `~` alias resolver, so
// that file (which itself imports `~/utils/theme-presets`) can't be
// imported directly here.
const THEME_PRIMARIES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'
] as const

const THEME_NEUTRALS = ['slate', 'zinc', 'stone', 'gray', 'neutral', 'mauve', 'taupe', 'mist', 'olive'] as const

const MODES = ['Dark', 'Light'] as const

/** Renders a `.tick-on-swatch` probe for `token` (e.g. "primary-400") and
 * returns its real computed contrast ratio — the exact class and CSS custom
 * property app/pages/clients.vue uses. */
async function swatchContrast(page: Page, token: string): Promise<number> {
  return page.evaluate((token) => {
    const canvas = document.createElement('canvas').getContext('2d')!
    const rgbOf = (color: string) => {
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = color
      canvas.fillRect(0, 0, 1, 1)
      return Array.from(canvas.getImageData(0, 0, 1, 1).data).slice(0, 3) as [number, number, number]
    }
    const luminance = ([r, g, b]: number[]) => {
      const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const el = document.createElement('span')
    el.className = 'tick-on-swatch'
    el.style.setProperty('--client-bg', `var(--ui-color-${token})`)
    el.textContent = 'AA'
    document.body.appendChild(el)
    const cs = getComputedStyle(el)
    const fg = rgbOf(cs.color)
    const bg = rgbOf(cs.backgroundColor)
    el.remove()
    const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
    return (lighter + 0.05) / (darker + 0.05)
  }, token)
}

/** Radix/reka RadioGroupItem's real hit target is `sr-only`; the visible
 * label sits on top and intercepts the pointer, so a plain `.click()` times
 * out waiting for "actionability" — force it, which dispatches the click
 * straight at the (real, ARIA-correct) `role="radio"` element itself. */
async function setMode(page: Page, mode: (typeof MODES)[number]) {
  await page.getByRole('radio', { name: mode }).click({ force: true })
}

async function setPrimary(page: Page, primary: string) {
  await page.getByRole('button', { name: `Primary color ${primary}` }).click()
}

async function setNeutral(page: Page, neutral: string) {
  await page.getByRole('button', { name: `Neutral palette ${neutral}` }).click()
}

async function restoreDefaultTheme(page: Page) {
  await page.goto('/settings')
  const btn = page.getByRole('button', { name: 'Apply Nocturne preset' })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
}

test.describe('client avatar swatch ink — every primary × every neutral', () => {
  // Every test here changes primary/neutral/mode via the real editor, which
  // persists server-side (`PATCH /api/me/theme`) — restore the default so
  // whichever spec runs next isn't left in some arbitrary combination.
  test.afterEach(async ({ page }) => {
    await restoreDefaultTheme(page)
  })

  test('every primary clears 4.5:1 on primary-400 and primary-600, in both modes', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/settings')
    const failures: string[] = []

    for (const mode of MODES) {
      await setMode(page, mode)
      for (const primary of THEME_PRIMARIES) {
        await setPrimary(page, primary)
        for (const token of ['primary-400', 'primary-600']) {
          const ratio = await swatchContrast(page, token)
          if (ratio < 4.5) failures.push(`${mode}/${primary}/${token} = ${ratio.toFixed(2)}`)
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  test('every neutral clears 4.5:1 on neutral-400, in both modes', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/settings')
    const failures: string[] = []

    for (const mode of MODES) {
      await setMode(page, mode)
      for (const neutral of THEME_NEUTRALS) {
        await setNeutral(page, neutral)
        const ratio = await swatchContrast(page, 'neutral-400')
        if (ratio < 4.5) failures.push(`${mode}/${neutral}/neutral-400 = ${ratio.toFixed(2)}`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  test('secondary-600 (fixed regardless of primary/neutral) clears 4.5:1 in both modes', async ({ page }) => {
    await page.goto('/settings')
    const failures: string[] = []

    for (const mode of MODES) {
      await setMode(page, mode)
      const ratio = await swatchContrast(page, 'secondary-600')
      if (ratio < 4.5) failures.push(`${mode}/secondary-600 = ${ratio.toFixed(2)}`)
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
