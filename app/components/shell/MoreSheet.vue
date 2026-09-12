<script setup lang="ts">
// "More" bottom sheet (mobile tab bar): manage links + user row + logout.
// UDrawer bottom sheet with a grab handle; rows are ≥48px hit targets.
const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const session = useUserSession()

const user = computed(() => session.user.value as SessionUser | null)

const links = [
  { label: 'Projects & tasks', to: '/projects', icon: 'i-lucide-folder' },
  { label: 'Clients', to: '/clients', icon: 'i-lucide-users' },
  { label: 'Tags', to: '/tags', icon: 'i-lucide-tag' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
]

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

async function logout() {
  open.value = false
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  await session.clear()
  await navigateTo('/login')
}
</script>

<template>
  <UDrawer v-model:open="open" :handle="true" aria-label="More">
    <template #content>
      <div class="flex flex-col gap-1 px-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div class="px-3 pb-1 text-[10px] tracking-[0.1em] uppercase text-dimmed">Manage</div>

        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors"
          :class="route.path.startsWith(l.to)
            ? 'bg-elevated text-highlighted shadow-[inset_2px_0_0_var(--ui-primary)]'
            : 'text-toned hover:bg-elevated/50'"
          @click="open = false"
        >
          <UIcon :name="l.icon" class="size-[18px] shrink-0" />
          {{ l.label }}
        </NuxtLink>

        <div class="my-1.5 border-t border-default" />

        <!-- User + logout -->
        <div class="flex min-h-12 items-center gap-3 px-3">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accented text-[11px] font-semibold text-default">
            {{ initials(user?.name) }}
          </span>
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block truncate text-[13px] text-default">{{ user?.name ?? '—' }}</span>
            <span class="block truncate text-[11px] text-dimmed tnum">{{ roleLine }}</span>
          </span>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-log-out"
            label="Log out"
            class="min-h-11"
            @click="logout"
          />
        </div>
      </div>
    </template>
  </UDrawer>
</template>
