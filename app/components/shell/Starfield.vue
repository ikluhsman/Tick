<script setup lang="ts">
// Tiny radial-gradient star dots layered over the host's gradient background.
// Visible only when the theme's starfield toggle is on AND the app is in dark mode
// (auto-off in light mode per the design spec). `force` bypasses the toggle (not the mode).
const props = withDefaults(defineProps<{
  /** Repeat the 9-dot pattern for large surfaces (auth backdrop) */
  tile?: boolean
  /** Ignore the theme toggle (still hidden in light mode) */
  force?: boolean
}>(), {
  tile: false,
  force: false
})

const theme = useThemeStore()
const colorMode = useColorMode()

const visible = computed(() =>
  (props.force || theme.starfield) && colorMode.value === 'dark'
)
</script>

<template>
  <div
    v-if="visible"
    class="tick-stars pointer-events-none absolute inset-0"
    :class="{ 'tick-stars--tile': tile }"
    aria-hidden="true"
  />
</template>
