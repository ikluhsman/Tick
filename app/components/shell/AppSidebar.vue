<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const route = useRoute()
const session = useUserSession()

const user = computed(() => session.user.value as SessionUser | null)

const mainNav = [
  { label: 'Dashboard', to: '/', icon: 'i-lucide-layout-grid' },
  { label: 'Time', to: '/time', icon: 'i-lucide-clock' },
  { label: 'Calendar', to: '/calendar', icon: 'i-lucide-calendar' },
  { label: 'Reports', to: '/reports', icon: 'i-lucide-chart-column' }
]

const manageNav = [
  { label: 'Projects & tasks', to: '/projects', icon: 'i-lucide-folder' },
  { label: 'Clients', to: '/clients', icon: 'i-lucide-users' },
  { label: 'Tags', to: '/tags', icon: 'i-lucide-tag' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

function initials(name?: string | null) {
  return (name ?? '?')
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const roleLine = computed(() => {
  const u = user.value
  if (!u) return ''
  const role = u.role.charAt(0).toUpperCase() + u.role.slice(1)
  return u.defaultRate != null ? `${role} · $${u.defaultRate}/h default` : role
})

const orgItems = computed<DropdownMenuItem[][]>(() => [[
  {
    label: user.value?.orgName ?? 'Organization',
    icon: 'i-lucide-check'
  }
]])

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  await session.clear()
  await navigateTo('/login')
}

const userItems = computed<DropdownMenuItem[][]>(() => [[
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Log out', icon: 'i-lucide-log-out', onSelect: () => { logout() } }
]])
</script>

<template>
  <aside
    class="sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-4 overflow-hidden border-r border-default px-3 py-4 text-toned"
    :style="{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-elevated) 55%, var(--ui-bg)) 0%, var(--ui-bg) 70%)' }"
  >
    <ShellStarfield />

    <!-- Logo + wordmark -->
    <NuxtLink to="/" class="relative flex items-center gap-2.5 px-1.5">
      <ShellTickLogo :size="42" glow />
      <span class="text-xl leading-none font-medium tracking-tight text-highlighted">Tick</span>
    </NuxtLink>

    <!-- Org switcher -->
    <UDropdownMenu :items="orgItems" :content="{ align: 'start' }" :ui="{ content: 'w-48' }">
      <button
        type="button"
        class="relative flex items-center gap-2.5 rounded-sm border border-default px-2.5 py-[7px] text-left transition-colors hover:bg-elevated/50"
      >
        <span class="flex size-[22px] items-center justify-center rounded-xs bg-primary/15 text-[10px] font-semibold text-primary">
          {{ initials(user?.orgName) }}
        </span>
        <span class="flex-1 truncate text-[13px] text-default">{{ user?.orgName ?? '—' }}</span>
        <UIcon name="i-lucide-chevrons-up-down" class="size-3.5 text-muted" />
      </button>
    </UDropdownMenu>

    <!-- Main nav -->
    <nav class="relative flex flex-col gap-0.5">
      <NuxtLink
        v-for="n in mainNav"
        :key="n.to"
        :to="n.to"
        :aria-current="isActive(n.to) ? 'page' : undefined"
        class="flex items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-sm font-medium transition-colors"
        :class="isActive(n.to)
          ? 'bg-elevated text-highlighted shadow-[inset_2px_0_0_var(--ui-primary)]'
          : 'text-muted hover:bg-elevated/50 hover:text-default'"
      >
        <UIcon :name="n.icon" class="size-[18px] shrink-0" />
        <span class="flex-1">{{ n.label }}</span>
      </NuxtLink>
    </nav>

    <!-- Manage -->
    <div class="relative flex flex-col gap-1.5">
      <div class="px-2.5 text-[10px] tracking-[0.1em] uppercase text-dimmed">Manage</div>
      <nav class="flex flex-col gap-0.5">
        <NuxtLink
          v-for="n in manageNav"
          :key="n.to"
          :to="n.to"
          :aria-current="isActive(n.to) ? 'page' : undefined"
          class="flex items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-sm font-medium transition-colors"
          :class="isActive(n.to)
            ? 'bg-elevated text-highlighted shadow-[inset_2px_0_0_var(--ui-primary)]'
            : 'text-muted hover:bg-elevated/50 hover:text-default'"
        >
          <UIcon :name="n.icon" class="size-[18px] shrink-0" />
          <span class="flex-1">{{ n.label }}</span>
        </NuxtLink>
      </nav>
    </div>

    <!-- User footer -->
    <div class="relative mt-auto">
      <UDropdownMenu :items="userItems" :content="{ align: 'start', side: 'top' }" :ui="{ content: 'w-48' }">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-elevated/50"
        >
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accented text-[11px] font-semibold text-default">
            {{ initials(user?.name) }}
          </span>
          <span class="min-w-0 leading-tight">
            <span class="block truncate text-[13px] text-default">{{ user?.name ?? '—' }}</span>
            <span class="block truncate text-[11px] text-dimmed tnum">{{ roleLine }}</span>
          </span>
        </button>
      </UDropdownMenu>
    </div>
  </aside>
</template>
