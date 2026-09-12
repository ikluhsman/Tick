// Theme store — drives the live theme editor (Settings → Appearance).
// apply(): updateAppConfig ui.colors + --ui-radius / --font-sans on :root + color mode.
// Persists to localStorage `tick-theme` and PATCH /api/me/theme (jsonb).

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

export const THEME_PRIMARIES = ['violet', 'indigo', 'sky', 'teal', 'emerald', 'amber', 'rose', 'fuchsia'] as const
export const THEME_NEUTRALS = ['slate', 'zinc', 'stone', 'gray', 'neutral'] as const

const NOCTURNE: Omit<ThemeSettings, 'preset'> = {
  primary: 'violet',
  neutral: 'zinc',
  radius: 4,
  font: 'Inter',
  mode: 'dark',
  starfield: true
}

export const THEME_PRESETS: { name: string, sub: string, settings: Omit<ThemeSettings, 'preset'> }[] = [
  { name: 'Nocturne', sub: 'the default', settings: NOCTURNE },
  { name: 'Daylight', sub: 'light · sky · zinc', settings: { primary: 'sky', neutral: 'zinc', radius: 12, font: 'DM Sans', mode: 'light', starfield: false } },
  { name: 'Ember', sub: 'dark · amber · stone', settings: { primary: 'amber', neutral: 'stone', radius: 4, font: 'IBM Plex Sans', mode: 'dark', starfield: true } },
  { name: 'Orchard', sub: 'light · emerald · stone', settings: { primary: 'emerald', neutral: 'stone', radius: 16, font: 'Manrope', mode: 'light', starfield: false } },
  { name: 'Lagoon', sub: 'dark · teal · gray', settings: { primary: 'teal', neutral: 'gray', radius: 8, font: 'Source Sans 3', mode: 'dark', starfield: true } }
]

const STORAGE_KEY = 'tick-theme'

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode()

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
    const hit = THEME_PRESETS.find(p =>
      p.settings.primary === primary.value
      && p.settings.neutral === neutral.value
      && p.settings.radius === radius.value
      && p.settings.font === font.value
      && p.settings.mode === mode.value
      && p.settings.starfield === starfield.value
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
    if (persist) save()
  }

  function save() {
    const t = snapshot()
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
      } catch { /* storage unavailable */ }
    }
    $fetch('/api/me/theme', { method: 'PATCH', body: t }).catch(() => {})
  }

  /** Merge a partial change (from the editor), re-derive the preset name, apply. */
  function set(patch: Partial<ThemeSettings>) {
    if (patch.primary !== undefined) primary.value = patch.primary
    if (patch.neutral !== undefined) neutral.value = patch.neutral
    if (patch.radius !== undefined) radius.value = patch.radius
    if (patch.font !== undefined) font.value = patch.font
    if (patch.mode !== undefined) mode.value = patch.mode
    if (patch.starfield !== undefined) starfield.value = patch.starfield
    matchPreset()
    apply()
  }

  function applyPreset(name: string) {
    const p = THEME_PRESETS.find(x => x.name === name)
    if (!p) return
    primary.value = p.settings.primary
    neutral.value = p.settings.neutral
    radius.value = p.settings.radius
    font.value = p.settings.font
    mode.value = p.settings.mode
    starfield.value = p.settings.starfield
    preset.value = p.name
    apply()
  }

  function reset() {
    applyPreset('Nocturne')
  }

  /**
   * Restore a saved theme: explicit arg (users.theme jsonb on login) wins,
   * else localStorage. Applies without re-persisting.
   */
  function load(saved?: Partial<ThemeSettings> | null) {
    let t = saved ?? null
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
