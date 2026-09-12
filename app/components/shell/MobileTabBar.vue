<script setup lang="ts">
// Mobile bottom tab bar (<1024px): Dashboard, Time, Calendar, Reports, More.
// "More" opens the MoreSheet drawer (Projects & tasks, Clients, Tags, Settings,
// user + logout). Active tab = primary tint; every target ≥44px; the layout's
// dock wrapper owns the safe-area padding.
const route = useRoute()

const tabs = [
  { label: 'Dashboard', to: '/', icon: 'i-lucide-layout-grid' },
  { label: 'Time', to: '/time', icon: 'i-lucide-clock' },
  { label: 'Calendar', to: '/calendar', icon: 'i-lucide-calendar' },
  { label: 'Reports', to: '/reports', icon: 'i-lucide-chart-column' }
]

const moreRoutes = ['/projects', '/clients', '/tags', '/settings']

const moreOpen = ref(false)

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

const moreActive = computed(() => moreRoutes.some(p => route.path.startsWith(p)))
</script>

<template>
  <nav
    class="grid grid-cols-5 border-t border-default"
    aria-label="Primary"
  >
    <NuxtLink
      v-for="t in tabs"
      :key="t.to"
      :to="t.to"
      :aria-current="isActive(t.to) ? 'page' : undefined"
      class="flex min-h-[52px] flex-col items-center justify-center gap-[3px] py-1.5 text-[10px] font-medium transition-colors"
      :class="isActive(t.to) ? 'text-primary' : 'text-muted'"
    >
      <UIcon :name="t.icon" class="size-5" />
      {{ t.label }}
    </NuxtLink>

    <button
      type="button"
      class="flex min-h-[52px] flex-col items-center justify-center gap-[3px] py-1.5 text-[10px] font-medium transition-colors"
      :class="moreActive || moreOpen ? 'text-primary' : 'text-muted'"
      :aria-expanded="moreOpen"
      aria-label="More — projects, clients, tags, settings"
      @click="moreOpen = true"
    >
      <UIcon name="i-lucide-ellipsis" class="size-5" />
      More
    </button>

    <ShellMoreSheet v-model:open="moreOpen" />
  </nav>
</template>
