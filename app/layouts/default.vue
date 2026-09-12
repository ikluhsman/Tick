<script setup lang="ts">
// App shell: 224px sticky sidebar + main column (sticky timer bar, page content).
// <1024px the sidebar + timer bar hide and a fixed dock takes over: docked
// timer card above a bottom tab bar (More sheet holds the manage pages).
// The picker modal mounts here (after the slot) so the docked timer's +
// works on every screen; teleport order keeps it above ManualEntryDialog.
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
    <ShellAppSidebar class="max-lg:hidden" />
    <main class="flex min-w-0 flex-1 flex-col max-lg:pb-[calc(150px+env(safe-area-inset-bottom))]">
      <ShellTimerBar class="max-lg:hidden" />
      <slot />
    </main>

    <!-- Mobile dock: timer card above the tab bar, on every screen -->
    <div
      class="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 pt-4 lg:hidden"
      :style="{
        background: 'linear-gradient(180deg, transparent, var(--ui-bg) 28%)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }"
    >
      <ShellMobileTimerCard />
      <ShellMobileTabBar />
    </div>

    <!-- Shared picker (timer bar, docked timer, manual entry, bulk move) -->
    <TimePickerModal />
  </div>
</template>
