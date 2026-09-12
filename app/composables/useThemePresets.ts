// Theme presets for Settings → Appearance.
// Two groups: Tick's five handoff presets, plus presets recovered from the
// Nuxt UI Theme Studio (ui.nuxt.com/theme), adapted to this app's constraints:
//   - custom studio palettes (mauve, mist, olive, taupe, cobalt…) → nearest
//     Tailwind palette (Nuxt UI's `ui.colors` only re-resolves Tailwind names)
//   - studio fonts not loaded in nuxt.config → nearest of the five loaded faces
//   - radius clamped to the editor's 0–0.5rem scale
//   - studio presets are mode-agnostic → a mode is chosen to match the vibe.
// The editor is a UI over useThemeStore(); applying a preset just calls
// themeStore.set() with every field, then pins the preset name.

import colors from 'tailwindcss/colors'
import { THEME_FONTS, type ThemeSettings } from '~/stores/theme'

export interface ThemePreset extends Omit<ThemeSettings, 'preset'> {
  name: string
  sub: string
  source: 'tick' | 'nuxt-ui'
}

/** Radius segmented control: label ↔ md radius in px (--ui-radius = px/16 rem). */
export const RADIUS_OPTIONS = [
  { label: 'None', px: 0 },
  { label: 'Sm', px: 2 },
  { label: 'Md', px: 4 },
  { label: 'Lg', px: 6 },
  { label: 'Xl', px: 8 }
] as const

/** The five presets from the design handoff. Nocturne is the app default. */
export const TICK_PRESETS: ThemePreset[] = [
  { name: 'Nocturne', sub: 'the default', source: 'tick', primary: 'violet', neutral: 'zinc', radius: 4, font: 'Inter', mode: 'dark', starfield: true },
  { name: 'Daylight', sub: 'light · sky · zinc', source: 'tick', primary: 'sky', neutral: 'zinc', radius: 6, font: 'DM Sans', mode: 'light', starfield: false },
  { name: 'Ember', sub: 'dark · amber · stone', source: 'tick', primary: 'amber', neutral: 'stone', radius: 2, font: 'IBM Plex Sans', mode: 'dark', starfield: true },
  { name: 'Orchard', sub: 'light · emerald · stone', source: 'tick', primary: 'emerald', neutral: 'stone', radius: 8, font: 'Manrope', mode: 'light', starfield: false },
  { name: 'Lagoon', sub: 'dark · teal · slate', source: 'tick', primary: 'teal', neutral: 'slate', radius: 4, font: 'Source Sans 3', mode: 'dark', starfield: true }
]

/**
 * Recovered from ui.nuxt.com/theme (Theme Studio preset library), adapted:
 *   Iris      violet / mauve→zinc  / 0.5rem  / Manrope
 *   Crimson   red    / neutral     / 0       / Inter        (exact)
 *   Coral     rose   / stone       / 0.5rem  / Plus Jakarta Sans→DM Sans
 *   Mint      teal   / olive→stone / .75→.5  / Nunito→DM Sans
 *   Cobalt    cobalt→blue / cobalt-gray→gray / 0.125rem / Roboto→IBM Plex Sans
 *   Sunset    orange / taupe→stone / .625→.5 / Bricolage Grotesque→Manrope
 *   Bubblegum pink / saturated-mauve→zinc / 0.375rem / Poppins→DM Sans
 * (Skipped: Default, Mono — black-as-primary unsupported; Sky ≈ Daylight;
 *  Carbon ≈ Ember; Parchment — custom clay primary has no Tailwind analogue.)
 */
export const STUDIO_PRESETS: ThemePreset[] = [
  { name: 'Iris', sub: 'light · violet · zinc', source: 'nuxt-ui', primary: 'violet', neutral: 'zinc', radius: 8, font: 'Manrope', mode: 'light', starfield: false },
  { name: 'Crimson', sub: 'dark · red · neutral', source: 'nuxt-ui', primary: 'red', neutral: 'neutral', radius: 0, font: 'Inter', mode: 'dark', starfield: true },
  { name: 'Coral', sub: 'light · rose · stone', source: 'nuxt-ui', primary: 'rose', neutral: 'stone', radius: 8, font: 'DM Sans', mode: 'light', starfield: false },
  { name: 'Mint', sub: 'light · teal · stone', source: 'nuxt-ui', primary: 'teal', neutral: 'stone', radius: 8, font: 'DM Sans', mode: 'light', starfield: false },
  { name: 'Cobalt', sub: 'light · blue · gray', source: 'nuxt-ui', primary: 'blue', neutral: 'gray', radius: 2, font: 'IBM Plex Sans', mode: 'light', starfield: false },
  { name: 'Sunset', sub: 'dark · orange · stone', source: 'nuxt-ui', primary: 'orange', neutral: 'stone', radius: 8, font: 'Manrope', mode: 'dark', starfield: true },
  { name: 'Bubblegum', sub: 'light · pink · zinc', source: 'nuxt-ui', primary: 'pink', neutral: 'zinc', radius: 6, font: 'DM Sans', mode: 'light', starfield: false }
]

export const ALL_PRESETS: ThemePreset[] = [...TICK_PRESETS, ...STUDIO_PRESETS]

type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950

/**
 * CSS color for a Tailwind palette name + shade. Uses the `--color-*` theme
 * variable when Tailwind emitted it, falling back to the palette value from
 * `tailwindcss/colors` — the exact pattern @nuxt/ui's colors plugin uses
 * (Tailwind v4 renames the `neutral` palette var to `old-neutral`).
 */
export function paletteColor(name: string, shade: Shade): string {
  const record = (colors as unknown as Record<string, Record<number, string>>)[name]
  const fallback = record?.[shade] ?? 'transparent'
  const varName = name === 'neutral' ? 'old-neutral' : name
  return `var(--color-${varName}-${shade}, ${fallback})`
}

export interface PresetChrome {
  bg: string
  surface: string
  text: string
  accent: string
  border: string
  fontFamily: string
  /** border-radius (px) of the little radius sample rect */
  sampleRadius: number
}

/** Colors a preset card paints itself with (its own mini-theme, not the app's). */
export function presetChrome(p: ThemePreset): PresetChrome {
  const light = p.mode === 'light'
  return {
    bg: paletteColor(p.neutral, light ? 50 : 900),
    surface: paletteColor(p.neutral, light ? 200 : 800),
    text: paletteColor(p.neutral, light ? 900 : 100),
    accent: paletteColor(p.primary, light ? 500 : 400),
    border: paletteColor(p.neutral, light ? 300 : 700),
    fontFamily: THEME_FONTS[p.font] ?? THEME_FONTS.Inter!,
    sampleRadius: Math.min(9, p.radius / 2 + 1)
  }
}

export function useThemePresets() {
  const theme = useThemeStore()

  /** Name of the preset the current settings exactly match, else null. */
  const activeName = computed(() => {
    const hit = ALL_PRESETS.find(p =>
      p.primary === theme.primary
      && p.neutral === theme.neutral
      && p.radius === theme.radius
      && p.font === theme.font
      && p.mode === theme.mode
      && p.starfield === theme.starfield
    )
    return hit ? hit.name : null
  })

  function isActive(p: ThemePreset) {
    return activeName.value === p.name
  }

  /** Apply every field of a preset through the store (live + persisted). */
  function applyPreset(p: ThemePreset) {
    theme.set({
      primary: p.primary,
      neutral: p.neutral,
      radius: p.radius,
      font: p.font,
      mode: p.mode,
      starfield: p.starfield
    })
    // store.matchPreset() only knows the store's own list — pin the real name.
    theme.preset = p.name
  }

  return {
    presets: ALL_PRESETS,
    tickPresets: TICK_PRESETS,
    studioPresets: STUDIO_PRESETS,
    activeName,
    isActive,
    applyPreset
  }
}
