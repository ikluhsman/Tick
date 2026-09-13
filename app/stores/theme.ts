// Theme store — drives the live theme editor (Settings → Appearance).
// apply(): updateAppConfig ui.colors + --ui-radius / --font-sans on :root + color mode.
// Persists to the `tick-theme` cookie (so SSR renders the saved theme — mode
// and starfield included — and hydration finds no mismatch), localStorage as a
// same-origin mirror, and PATCH /api/me/theme (jsonb, for other devices).
// The color mode itself also rides @nuxtjs/color-mode's own cookie
// (nuxt.config colorMode.storage = 'cookie'): its blocking head script sets
// the <html> class from that cookie before first paint, so a saved light theme
// never flashes dark.

import { ALL_PRESETS, DEFAULT_PRESET } from '~/utils/theme-presets'

export interface ThemeSettings {
  preset: string
  primary: string
  neutral: string
  /** md corner radius in px — 0 / 2 / 4 / 6 / 8 (--ui-radius = px/16 rem) */
  radius: number
  font: string
  mode: 'dark' | 'light'
  starfield: boolean
}

export const THEME_FONTS: Record<string, string> = {
  'Inter': "'Inter', system-ui, sans-serif",
  'DM Sans': "'DM Sans', system-ui, sans-serif",
  'IBM Plex Sans': "'IBM Plex Sans', system-ui, sans-serif",
  'Manrope': "'Manrope', system-ui, sans-serif",
  'Source Sans 3': "'Source Sans 3', system-ui, sans-serif"
}

// Full Tailwind v4 chromatic palette, spectrum order — matches the Nuxt UI theme picker.
export const THEME_PRIMARIES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'] as const
// Classic five + the four tinted neutrals Tailwind v4 added (OKLCH-tuned undertones).
export const THEME_NEUTRALS = ['slate', 'zinc', 'stone', 'gray', 'neutral', 'mauve', 'taupe', 'mist', 'olive'] as const

const NOCTURNE = DEFAULT_PRESET

const STORAGE_KEY = 'tick-theme'

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode()
  /** Readable on the server, so SSR paints the saved theme. */
  const cookie = useCookie<ThemeSettings | null>(STORAGE_KEY, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
    default: () => null
  })

  const preset = ref('Nocturne')
  const primary = ref(NOCTURNE.primary)
  const neutral = ref(NOCTURNE.neutral)
  const radius = ref(NOCTURNE.radius)
  const font = ref(NOCTURNE.font)
  const mode = ref<'dark' | 'light'>(NOCTURNE.mode)
  const starfield = ref(NOCTURNE.starfield)

  function snapshot(): ThemeSettings {
    return {
      preset: preset.value,
      primary: primary.value,
      neutral: neutral.value,
      radius: radius.value,
      font: font.value,
      mode: mode.value,
      starfield: starfield.value
    }
  }

  function matchPreset() {
    const hit = ALL_PRESETS.find(p =>
      p.primary === primary.value
      && p.neutral === neutral.value
      && p.radius === radius.value
      && p.font === font.value
      && p.mode === mode.value
      && p.starfield === starfield.value
    )
    preset.value = hit ? hit.name : 'Custom'
  }

  /** Push the current settings into Nuxt UI + the DOM. Everything reads live — no save button. */
  function apply(persist = true) {
    updateAppConfig({ ui: { colors: { primary: primary.value, neutral: neutral.value } } })
    if (import.meta.client) {
      const root = document.documentElement
      root.style.setProperty('--ui-radius', `${radius.value / 16}rem`)
      root.style.setProperty('--font-sans', THEME_FONTS[font.value] ?? THEME_FONTS.Inter!)
    }
    colorMode.preference = mode.value
    // On the server the color-mode plugin only seeds `preference` from its
    // cookie; `value` stays at the config default. Mirror it so SSR renders
    // what the client's pre-paint script will apply (e.g. Starfield, which is
    // dark-mode only) — otherwise hydration reports a mismatch.
    // (`value` is typed read-only — the client plugin derives it from
    // preference; on the server nothing does, so set it directly.)
    if (import.meta.server) (colorMode as unknown as { value: string }).value = mode.value
    if (persist) save()
  }

  function save() {
    const t = snapshot()
    cookie.value = t
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
      } catch { /* storage unavailable */ }
    }
    $fetch('/api/me/theme', { method: 'PATCH', body: { theme: t } }).catch((err) => {
      // localStorage still holds the theme; log so a broken server persist isn't invisible
      if (import.meta.dev) console.warn('[theme] persist to server failed:', err)
    })
  }

  /**
   * Merge a partial change (from the editor), apply and persist. An explicit
   * `preset` in the patch wins (the editor pins the name it just applied);
   * otherwise the name is re-derived from the resulting settings.
   */
  function set(patch: Partial<ThemeSettings>) {
    if (patch.primary !== undefined) primary.value = patch.primary
    if (patch.neutral !== undefined) neutral.value = patch.neutral
    if (patch.radius !== undefined) radius.value = patch.radius
    if (patch.font !== undefined) font.value = patch.font
    if (patch.mode !== undefined) mode.value = patch.mode
    if (patch.starfield !== undefined) starfield.value = patch.starfield
    if (patch.preset !== undefined) preset.value = patch.preset
    else matchPreset()
    apply()
  }

  function applyPreset(name: string) {
    const p = ALL_PRESETS.find(x => x.name === name)
    if (!p) return
    set({
      primary: p.primary,
      neutral: p.neutral,
      radius: p.radius,
      font: p.font,
      mode: p.mode,
      starfield: p.starfield,
      preset: p.name
    })
  }

  function reset() {
    applyPreset('Nocturne')
  }

  /**
   * Restore a saved theme: explicit arg (users.theme jsonb on login) wins,
   * then the cookie (readable during SSR), then localStorage.
   * Applies without re-persisting.
   */
  function load(saved?: Partial<ThemeSettings> | null) {
    let t: Partial<ThemeSettings> | null = saved ?? cookie.value ?? null
    if (!t && import.meta.client) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) t = JSON.parse(raw) as Partial<ThemeSettings>
      } catch { /* ignore bad JSON */ }
    }
    if (t) {
      if (typeof t.primary === 'string') primary.value = t.primary
      if (typeof t.neutral === 'string') neutral.value = t.neutral
      if (typeof t.radius === 'number') radius.value = t.radius
      if (typeof t.font === 'string') font.value = t.font
      if (t.mode === 'dark' || t.mode === 'light') mode.value = t.mode
      if (typeof t.starfield === 'boolean') starfield.value = t.starfield
      matchPreset()
    }
    apply(false)
  }

  /** The `app.config.ts` snippet shown in the theme editor. */
  const configText = computed(() =>
    `export default defineAppConfig({\n`
    + `  ui: {\n`
    + `    colors: { primary: '${primary.value}', neutral: '${neutral.value}' }\n`
    + `  },\n`
    + `  tick: {\n`
    + `    radius: ${radius.value / 16},   // --ui-radius: ${radius.value / 16}rem\n`
    + `    font: '${font.value}',\n`
    + `    colorMode: '${mode.value}',\n`
    + `    sidebar: '${starfield.value ? 'stars' : 'plain'}'\n`
    + `  }\n`
    + `})`
  )

  return {
    preset,
    primary,
    neutral,
    radius,
    font,
    mode,
    starfield,
    configText,
    apply,
    set,
    applyPreset,
    reset,
    load,
    save
  }
})
