<script setup lang="ts">
// Settings → Appearance: the theme editor. A UI over useThemeStore() —
// every control calls theme.set(), which applies live (updateAppConfig
// ui.colors, --ui-radius / --font-sans on :root, color mode) and persists
// (localStorage `tick-theme` + PATCH /api/me/theme). No save button.
import type { RadioGroupItem } from '@nuxt/ui'
import { THEME_FONTS, THEME_PRIMARIES, THEME_NEUTRALS } from '~/stores/theme'
import { RADIUS_OPTIONS, paletteColor } from '~/composables/useThemePresets'

const theme = useThemeStore()
const { tickPresets, studioPresets, isActive, applyPreset } = useThemePresets()

// ── Swatch rows ────────────────────────────────────────────────────────────
// The 8 handoff primaries; if a preset set a primary outside the row
// (red, orange, pink, blue…), append it so the active color is always visible.
const primaryOptions = computed<string[]>(() => {
  const base: string[] = [...THEME_PRIMARIES]
  if (!base.includes(theme.primary)) base.push(theme.primary)
  return base
})

const neutralOptions = computed<string[]>(() => {
  const base: string[] = [...THEME_NEUTRALS]
  if (!base.includes(theme.neutral)) base.push(theme.neutral)
  return base
})

function swatchRing(active: boolean) {
  return active
    ? 'ring-2 ring-[var(--ui-primary)] ring-offset-2 ring-offset-[var(--ui-bg)]'
    : 'ring-1 ring-[var(--ui-border)] ring-offset-2 ring-offset-[var(--ui-bg)] hover:ring-[var(--ui-border-accented)]'
}

// ── Segmented controls (URadioGroup table variant) ─────────────────────────
const radiusItems: RadioGroupItem[] = RADIUS_OPTIONS.map(o => ({
  label: o.label,
  value: String(o.px)
}))

const modeItems: RadioGroupItem[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' }
]

const sidebarItems: RadioGroupItem[] = [
  { label: 'Starfield', value: 'stars' },
  { label: 'Plain', value: 'plain' }
]

// ── Fonts ──────────────────────────────────────────────────────────────────
const fontOptions = Object.entries(THEME_FONTS).map(([name, family]) => ({ name, family }))
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-2">
    <!-- ── Left column: controls ─────────────────────────────────────────── -->
    <div class="flex flex-col gap-[22px]">
      <!-- Presets -->
      <section class="flex flex-col gap-2.5">
        <div>
          <h3 class="text-[15px] font-medium text-highlighted">Presets</h3>
          <p class="text-xs text-muted">A starting point — every control below still applies on top.</p>
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
          <SettingsPresetCard
            v-for="p in tickPresets"
            :key="p.name"
            :preset="p"
            :active="isActive(p)"
            @apply="applyPreset(p)"
          />
        </div>
        <p class="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-dimmed">From the Nuxt UI theme studio</p>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
          <SettingsPresetCard
            v-for="p in studioPresets"
            :key="p.name"
            :preset="p"
            :active="isActive(p)"
            @apply="applyPreset(p)"
          />
        </div>
      </section>

      <!-- Primary -->
      <section class="flex flex-col gap-2.5">
        <div class="flex items-baseline gap-2">
          <h3 class="text-[15px] font-medium text-highlighted">Primary</h3>
          <span class="text-xs text-muted">{{ theme.primary }}</span>
        </div>
        <div class="flex flex-wrap gap-2.5">
          <button
            v-for="c in primaryOptions"
            :key="c"
            type="button"
            :title="c"
            :aria-label="`Primary color ${c}`"
            :aria-pressed="theme.primary === c"
            class="size-8 cursor-pointer rounded-full transition-shadow"
            :class="swatchRing(theme.primary === c)"
            :style="{ background: paletteColor(c, 500) }"
            @click="theme.set({ primary: c })"
          />
        </div>
      </section>

      <!-- Neutral -->
      <section class="flex flex-col gap-2.5">
        <div class="flex items-baseline gap-2">
          <h3 class="text-[15px] font-medium text-highlighted">Neutral</h3>
          <span class="text-xs text-muted">{{ theme.neutral }}</span>
        </div>
        <div class="flex flex-wrap gap-2.5">
          <button
            v-for="c in neutralOptions"
            :key="c"
            type="button"
            :title="c"
            :aria-label="`Neutral palette ${c}`"
            :aria-pressed="theme.neutral === c"
            class="size-8 cursor-pointer rounded-full transition-shadow"
            :class="swatchRing(theme.neutral === c)"
            :style="{ background: `linear-gradient(135deg, ${paletteColor(c, 200)} 50%, ${paletteColor(c, 700)} 50%)` }"
            @click="theme.set({ neutral: c })"
          />
        </div>
      </section>

      <!-- Radius + Mode -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section class="flex flex-col gap-2.5">
          <h3 class="text-[15px] font-medium text-highlighted">Radius</h3>
          <URadioGroup
            :model-value="String(theme.radius)"
            :items="radiusItems"
            variant="table"
            indicator="hidden"
            orientation="horizontal"
            size="sm"
            :ui="{ item: 'px-3 py-1.5' }"
            @update:model-value="(v: unknown) => theme.set({ radius: Number(v) })"
          />
        </section>
        <section class="flex flex-col gap-2.5">
          <h3 class="text-[15px] font-medium text-highlighted">Mode</h3>
          <URadioGroup
            :model-value="theme.mode"
            :items="modeItems"
            variant="table"
            indicator="hidden"
            orientation="horizontal"
            size="sm"
            :ui="{ item: 'px-3 py-1.5' }"
            @update:model-value="(v: unknown) => theme.set({ mode: v as 'dark' | 'light' })"
          />
        </section>
      </div>

      <!-- Font -->
      <section class="flex flex-col gap-2.5">
        <h3 class="text-[15px] font-medium text-highlighted">Font</h3>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="f in fontOptions"
            :key="f.name"
            type="button"
            :aria-pressed="theme.font === f.name"
            class="flex cursor-pointer items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-elevated/50"
            :class="theme.font === f.name ? 'border-primary' : 'border-default'"
            :style="{ fontFamily: f.family }"
            @click="theme.set({ font: f.name })"
          >
            <span class="flex-1 text-[15px] text-highlighted">{{ f.name }}</span>
            <span class="tnum text-xs text-dimmed">Aa 0123 · 2h 30m</span>
          </button>
        </div>
      </section>

      <!-- Sidebar -->
      <section class="flex flex-col gap-2.5">
        <h3 class="text-[15px] font-medium text-highlighted">Sidebar</h3>
        <URadioGroup
          :model-value="theme.starfield ? 'stars' : 'plain'"
          :items="sidebarItems"
          variant="table"
          indicator="hidden"
          orientation="horizontal"
          size="sm"
          :ui="{ item: 'px-3 py-1.5' }"
          @update:model-value="(v: unknown) => theme.set({ starfield: v === 'stars' })"
        />
        <p v-if="theme.mode === 'light'" class="text-[11px] text-dimmed">
          The starfield only shows in dark mode.
        </p>
      </section>
    </div>

    <!-- ── Right column: live sample + config (sticky) ───────────────────── -->
    <div class="sticky top-24">
      <SettingsThemeSample />
    </div>
  </div>
</template>
