// Theme presets for Settings → Appearance — the editor-side helpers.
// The preset data itself lives in ~/utils/theme-presets (shared with the store,
// which uses it for preset-name matching and Reset) and is re-exported here so
// the editor components keep importing from one place. Two groups: Tick's five
// handoff presets, plus presets recovered from the Nuxt UI Theme Studio
// (ui.nuxt.com/theme), adapted to this app's constraints:
//   - custom studio palettes (mauve, mist, olive, taupe, cobalt…) → nearest
//     Tailwind palette (Nuxt UI's `ui.colors` only re-resolves Tailwind names)
//   - studio fonts not loaded in nuxt.config → nearest of the five loaded faces
//   - radius clamped to the editor's 0–8px scale
//   - studio presets are mode-agnostic → a mode is chosen to match the vibe.
// The editor is a UI over useThemeStore(); applying a preset calls
// themeStore.set() with every field plus the preset name.

import colors from 'tailwindcss/colors'
import { THEME_FONTS } from '~/stores/theme'
import { ALL_PRESETS, RADIUS_OPTIONS, STUDIO_PRESETS, TICK_PRESETS, type ThemePreset } from '~/utils/theme-presets'

export { ALL_PRESETS, RADIUS_OPTIONS, STUDIO_PRESETS, TICK_PRESETS, type ThemePreset }

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
    theme.applyPreset(p.name)
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
