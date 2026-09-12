<script setup lang="ts">
// Slim demo-mode banner at the top of the app shell. Rendered only when
// NUXT_PUBLIC_DEMO_MODE is on; the X dismisses it for the browser session
// (sessionStorage). SSR renders it visible; a previously dismissed session
// hides it right after mount.
const demoMode = computed(() => Boolean(useRuntimeConfig().public.demoMode))
const dismissed = ref(false)

onMounted(() => {
  try {
    dismissed.value = sessionStorage.getItem('tick-demo-banner') === '1'
  } catch { /* storage unavailable → keep showing */ }
})

function dismiss() {
  dismissed.value = true
  try {
    sessionStorage.setItem('tick-demo-banner', '1')
  } catch { /* per-render dismissal only */ }
}
</script>

<template>
  <div
    v-if="demoMode && !dismissed"
    class="flex items-center justify-center gap-2 border-b border-default bg-elevated px-3 py-1.5"
  >
    <UIcon name="i-lucide-flask-conical" class="size-3.5 shrink-0 text-primary" />
    <p class="truncate text-xs text-muted">
      Demo — data resets nightly · login
      <span class="font-medium text-default">mara@example.com</span> /
      <span class="font-medium text-default">tick-demo</span>
    </p>
    <UButton
      icon="i-lucide-x"
      size="xs"
      color="neutral"
      variant="ghost"
      aria-label="Dismiss demo banner"
      @click="dismiss"
    />
  </div>
</template>
