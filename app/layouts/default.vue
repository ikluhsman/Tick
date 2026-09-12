<script setup lang="ts">
// App shell: 224px sticky sidebar + main column (sticky timer bar, page content).
// On mount: hydrate the running timer from the server and load the catalog
// (timer-bar counts + picker data). Pages own their content padding/max-width.
const timer = useTimerStore()
const catalog = useCatalogStore()

onMounted(() => {
  timer.hydrate()
  catalog.fetchAll().catch(() => {})
})
</script>

<template>
  <div class="flex min-h-screen bg-default text-default">
    <ShellAppSidebar />
    <main class="flex min-w-0 flex-1 flex-col">
      <ShellTimerBar />
      <slot />
    </main>
  </div>
</template>
