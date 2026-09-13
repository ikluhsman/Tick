// Theme preset data — the single source of truth for both the theme store
// (preset-name matching, Reset) and the editor UI (Settings → Appearance).
// Kept free of store imports so neither side pulls the other in a cycle.

export interface ThemePreset {
  name: string
  sub: string
  source: 'tick' | 'nuxt-ui'
  primary: string
  neutral: string
  /** md corner radius in px — must be one of RADIUS_OPTIONS */
  radius: number
  font: string
  mode: 'dark' | 'light'
  starfield: boolean
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

/** Nocturne — the app default, and what Reset returns to. */
export const DEFAULT_PRESET: ThemePreset = TICK_PRESETS[0]!
