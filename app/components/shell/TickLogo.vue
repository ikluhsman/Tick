<script setup lang="ts">
// Tick mark, from the design handoff (Tick Logo.dc.html):
// body is the dial (12/3/6/9 marks), front legs are the hour + minute hands,
// faint outer ring is the clock face. Stroke follows currentColor (primary by default).
withDefaults(defineProps<{
  /** Rendered square size in px */
  size?: number
  /** Soft accent drop-shadow behind the mark */
  glow?: boolean
  /** Favicon variant: drops the ring + dial marks, thickens strokes */
  compact?: boolean
}>(), {
  size: 42,
  glow: false,
  compact: false
})
</script>

<template>
  <svg
    v-if="!compact"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-label="Tick logo"
    class="shrink-0 text-primary"
    :style="glow ? { filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--ui-primary) 45%, transparent))' } : undefined"
  >
    <circle cx="32" cy="34" r="29" stroke-width="1.2" opacity=".35" />
    <path d="M32 5v3M32 60v3M3 34h3M58 34h3" stroke-width="1.6" opacity=".6" />
    <circle cx="32" cy="14" r="3.4" />
    <path d="M29.6 11.6 27.4 8.8M34.4 11.6 36.6 8.8" />
    <ellipse cx="32" cy="35" rx="13" ry="16" />
    <path d="M32 21.5v2.4M32 48.5v-2.4M20 35h2.4M44 35h-2.4" stroke-width="1.6" />
    <path d="M18.8 30C14.5 28.5 11 29 8 31.5" />
    <path d="M18.6 39.5C14 40 10.5 42.5 8.5 46" />
    <path d="M23.2 49C20 51.8 17.8 55 17.4 58" />
    <path d="M45.2 30C49.5 28.5 53 29 56 31.5" />
    <path d="M45.4 39.5C50 40 53.5 42.5 55.5 46" />
    <path d="M40.8 49C44 51.8 46.2 55 46.6 58" />
    <path d="M32 35 21.5 26" stroke-width="3" />
    <path d="M32 35 47.5 18.5" stroke-width="3" />
    <path d="M44.6 17.6l3.5 1 .6 3.5" stroke-width="2" />
    <circle cx="32" cy="35" r="1.8" fill="currentColor" />
  </svg>
  <svg
    v-else
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="3.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-label="Tick logo"
    class="shrink-0 text-primary"
  >
    <ellipse cx="32" cy="35" rx="13" ry="16" />
    <circle cx="32" cy="14" r="3.4" />
    <path d="M18.8 30C14.5 28.5 11 29 8 31.5M18.6 39.5C14 40 10.5 42.5 8.5 46M23.2 49C20 51.8 17.8 55 17.4 58M45.2 30C49.5 28.5 53 29 56 31.5M45.4 39.5C50 40 53.5 42.5 55.5 46M40.8 49C44 51.8 46.2 55 46.6 58" />
    <path d="M32 35 21.5 26M32 35 47.5 18.5" stroke-width="4" />
  </svg>
</template>
