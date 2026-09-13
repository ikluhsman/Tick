<script setup lang="ts">
// Settings → Trash: soft-deleted rows grouped by entity, restorable for 30
// days (GET /api/trash purges anything older). Restore uses the existing
// POST /api/restore shape; "Delete forever" / "Empty trash" hard-delete via
// POST /api/trash/purge (entries first, FK safety — server handles order).
import type { TrashDto, TrashEntity, TrashItemDto } from '#shared/types/settings'

const toast = useToast()

const trash = ref<TrashDto | null>(null)
const loading = ref(true)
const busy = ref(false)

const SECTIONS: { key: TrashEntity, label: string, icon: string }[] = [
  { key: 'clients', label: 'Clients', icon: 'i-lucide-briefcase' },
  { key: 'projects', label: 'Projects', icon: 'i-lucide-folder' },
  { key: 'tasks', label: 'Tasks', icon: 'i-lucide-circle-check' },
  { key: 'tags', label: 'Tags', icon: 'i-lucide-tag' },
  { key: 'entries', label: 'Time entries', icon: 'i-lucide-clock' }
]

const totalCount = computed(() =>
  trash.value ? SECTIONS.reduce((n, s) => n + trash.value![s.key].length, 0) : 0
)

async function load() {
  loading.value = true
  try {
    trash.value = await $fetch<TrashDto>('/api/trash')
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    loading.value = false
  }
}
onMounted(load)

function deletedLabel(item: TrashItemDto) {
  return new Date(item.deletedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

/** Empty restore/purge id sets keyed by entity. */
function emptyIds(): Record<TrashEntity, string[]> {
  return { clients: [], projects: [], tasks: [], tags: [], entries: [] }
}

// ── Restore ────────────────────────────────────────────────────────────────
async function restore(entity: TrashEntity, item: TrashItemDto) {
  if (busy.value) return
  busy.value = true
  try {
    const deleted = emptyIds()
    deleted[entity] = [item.id]
    await $fetch('/api/restore', { method: 'POST', body: { deleted } })
    toast.add({
      title: `Restored “${item.name || 'Untitled entry'}”`,
      icon: 'i-lucide-rotate-ccw',
      color: 'primary'
    })
    await load()
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

async function restoreAll() {
  if (busy.value || !trash.value || !totalCount.value) return
  busy.value = true
  try {
    const deleted = emptyIds()
    for (const s of SECTIONS) deleted[s.key] = trash.value[s.key].map(i => i.id)
    await $fetch('/api/restore', { method: 'POST', body: { deleted } })
    toast.add({ title: `Restored ${totalCount.value} items`, icon: 'i-lucide-rotate-ccw', color: 'primary' })
    await load()
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

// ── Delete forever ─────────────────────────────────────────────────────────
const confirmState = ref<{ mode: 'one', entity: TrashEntity, item: TrashItemDto } | { mode: 'all' } | null>(null)

const confirmText = computed(() => {
  if (!confirmState.value) return ''
  if (confirmState.value.mode === 'all') {
    return `Permanently delete all ${totalCount.value} trashed items? This can't be undone.`
  }
  const name = confirmState.value.item.name || 'Untitled entry'
  return `Permanently delete “${name}”? This can't be undone.`
})

async function confirmPurge() {
  const state = confirmState.value
  if (!state || busy.value) return
  busy.value = true
  try {
    if (state.mode === 'all') {
      await $fetch('/api/trash/purge', { method: 'POST', body: { all: true } })
      toast.add({ title: 'Trash emptied', icon: 'i-lucide-trash-2', color: 'neutral' })
    } else {
      const items = emptyIds()
      items[state.entity] = [state.item.id]
      await $fetch('/api/trash/purge', { method: 'POST', body: { items } })
      toast.add({
        title: `Deleted “${state.item.name || 'Untitled entry'}” forever`,
        icon: 'i-lucide-trash-2',
        color: 'neutral'
      })
    }
    confirmState.value = null
    await load()
  } catch (err) {
    toast.add({ title: apiError(err), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

function apiError(err: unknown): string {
  const e = err as { data?: { message?: string } }
  return e.data?.message ?? 'Something went wrong. Try again.'
}
</script>

<template>
  <div class="flex flex-col gap-[22px]">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-[11px]">
      <p class="min-w-0 flex-1 text-[13px] text-muted">
        Deleted items stay here for 30 days, then purge automatically.
        <span v-if="totalCount" class="tnum text-toned">{{ totalCount }} in trash.</span>
      </p>
      <div v-if="totalCount" class="flex gap-2">
        <UButton
          color="primary"
          variant="outline"
          icon="i-lucide-rotate-ccw"
          label="Restore all"
          :disabled="busy"
          @click="restoreAll"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-trash-2"
          label="Empty trash"
          :disabled="busy"
          @click="confirmState = { mode: 'all' }"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!loading && !totalCount"
      class="rounded-lg border border-default bg-elevated px-[22px] py-10 text-center shadow-sm"
    >
      <UIcon name="i-lucide-trash-2" class="mx-auto mb-2 size-6 text-dimmed" />
      <p class="text-sm text-muted">Trash is empty — nothing has been deleted in the last 30 days.</p>
    </div>

    <!-- Sections -->
    <template v-if="trash">
      <div
        v-for="s in SECTIONS"
        :key="s.key"
        v-show="trash[s.key].length"
        class="overflow-hidden rounded-lg border border-default bg-elevated shadow-sm"
      >
        <div class="flex items-center gap-2 border-b border-default px-[22px] py-2.5">
          <UIcon :name="s.icon" class="size-4 text-dimmed" />
          <h2 class="text-[14px] font-medium text-highlighted">{{ s.label }}</h2>
          <span class="tnum text-xs text-muted">{{ trash[s.key].length }}</span>
        </div>

        <div
          v-for="item in trash[s.key]"
          :key="item.id"
          class="flex items-center gap-[11px] border-b border-default px-[22px] py-2.5 last:border-0"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm text-highlighted">{{ item.name || 'Untitled entry' }}</div>
            <div class="text-xs text-muted">Deleted {{ deletedLabel(item) }}</div>
          </div>
          <UBadge
            :color="item.daysLeft <= 5 ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
            class="tnum"
          >
            {{ item.daysLeft }}d left
          </UBadge>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-rotate-ccw"
            label="Restore"
            :disabled="busy"
            @click="restore(s.key, item)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            square
            size="sm"
            title="Delete forever"
            aria-label="Delete forever"
            class="text-dimmed hover:text-primary"
            :disabled="busy"
            @click="confirmState = { mode: 'one', entity: s.key, item }"
          />
        </div>
      </div>
    </template>

    <!-- Confirm modal -->
    <UModal
      :open="confirmState != null"
      :title="confirmState?.mode === 'all' ? 'Empty trash?' : 'Delete forever?'"
      :ui="{ content: 'max-w-[420px]' }"
      @update:open="(v: boolean) => { if (!v) confirmState = null }"
    >
      <template #body>
        <p class="text-sm text-default">{{ confirmText }}</p>
      </template>
      <template #footer>
        <div class="ml-auto flex items-center gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" @click="confirmState = null" />
          <UButton
            color="primary"
            variant="outline"
            :label="confirmState?.mode === 'all' ? 'Empty trash' : 'Delete forever'"
            :loading="busy"
            @click="confirmPurge"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
