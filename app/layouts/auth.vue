<script setup lang="ts">
// Bare centered layout for /login and /register — logo over a subtle starfield.
</script>

<template>
  <main
    class="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-default p-6 text-default"
    :style="{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-elevated) 40%, var(--ui-bg)) 0%, var(--ui-bg) 60%)' }"
  >
    <ShellStarfield tile force />
    <div class="relative flex flex-col items-center gap-3">
      <ShellTickLogo :size="56" glow />
      <div class="text-2xl font-medium tracking-tight text-highlighted">Tick</div>
    </div>
    <div class="relative w-full max-w-[400px]">
      <slot />
    </div>
  </main>
</template>
