<script setup lang="ts">
// Tags — inline New tag input (Enter adds; lowercased, # stripped, deduped) +
// table: #tag chip, Used on, Entries, Hours, Last used, filter-jump, delete
// (strips labels only, undo toast — Rule 4).

const catalog = useCatalogStore()
const toast = useToast()
const ui = useUiStore()

useHead({ title: 'Tags · Tick' })

// SSR-hydrated catalog: fetched on the server (state rides the Pinia payload;
// the layout's on-mount fetchAll() skips once via catalog.ssrFetched) and
// refreshed on later client-side visits.
await useAsyncData('catalog', async () => {
  await catalog.fetchAll()
  return true
})

const newTag = ref('')
const adding = ref(false)

async function addTag() {
  const clean = newTag.value.trim().replace(/^#/, '').toLowerCase()
  if (!clean || adding.value) return
  // Duplicate (case-insensitive — tags are stored lowercase): say so, keep the input
  if (catalog.tags.some(t => t.name.toLowerCase() === clean)) {
    toast.add({ title: `Tag #${clean} already exists`, icon: 'i-lucide-tag', color: 'neutral' })
    return
  }
  adding.value = true
  try {
    await catalog.createTag(clean)
    newTag.value = ''
  } finally {
    adding.value = false
  }
}

// "Used on" — the DTO carries a distinct project/client count, not names
function usedOnLabel(t: TagDto) {
  if (!t.entryCount) return 'Not used yet'
  if (!t.usedOn) return 'Entries without a project'
  return `${t.usedOn} project${t.usedOn === 1 ? '' : 's'}`
}

// Last used: Today, Yesterday, weekday (<7 days), else "Wed, Sep 2" (+ year if different)
function lastUsedLabel(iso: string | null) {
  return iso ? formatDayLabel(iso) : '—'
}

// Filter-jump — the Time page reads ?filter=
function jumpToTime(t: TagDto) {
  navigateTo({ path: '/time', query: { filter: `#${t.name}` } })
}

// Delete strips the label from entries, never the time — undo restores the snapshot
async function removeTag(t: TagDto) {
  await catalog.removeTag(t.id)
  toast.add({
    title: t.entryCount
      ? `Removed #${t.name} from ${t.entryCount} ${t.entryCount === 1 ? 'entry' : 'entries'}`
      : `Deleted #${t.name}`,
    icon: 'i-lucide-tag',
    duration: ui.undoSeconds * 1000, // Rule 4: 3–30s, Settings → Profile
    actions: [{
      label: 'Undo',
      color: 'primary',
      variant: 'outline',
      onClick: async () => {
        // The tag was soft-deleted (entry_tags rows kept), so restoring the id brings the labels back
        await $fetch('/api/restore', { method: 'POST', body: { deleted: { tags: [t.id] } } })
        await catalog.fetchAll()
        await useEntriesStore().refresh().catch(() => {})
      }
    }]
  })
}
</script>

<template>
  <div class="flex w-full max-w-[1100px] flex-col gap-[22px] px-[22px] pt-[22px] pb-[120px]">
    <!-- Header + inline new-tag input -->
    <div class="flex flex-wrap items-end gap-[11px]">
      <div class="min-w-[200px] flex-1">
        <h1 class="text-[28px] leading-tight font-medium text-highlighted">Tags</h1>
        <div class="text-[13px] text-muted">
          Free-form labels across clients and projects.
          Type <b class="font-medium text-toned">#tag</b> anywhere an entry is named.
        </div>
      </div>
      <div class="flex gap-1.5">
        <UInput
          v-model="newTag"
          placeholder="New tag"
          aria-label="New tag"
          class="w-[180px]"
          @keydown.enter="addTag"
        />
        <UButton color="primary" variant="outline" label="Add" :loading="adding" @click="addTag" />
      </div>
    </div>

    <!-- Table card -->
    <div class="overflow-hidden rounded-lg border border-default bg-elevated shadow-sm">
      <div
        class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_80px_90px_110px_70px] gap-[11px] border-b border-default px-[22px] py-2 text-[10px] tracking-[0.08em] text-muted uppercase"
      >
        <span>Tag</span>
        <span>Used on</span>
        <span class="text-right">Entries</span>
        <span class="text-right">Hours</span>
        <span>Last used</span>
        <span />
      </div>

      <div
        v-for="t in catalog.tags"
        :key="t.id"
        class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_80px_90px_110px_70px] items-center gap-[11px] border-b border-default px-[22px] py-2.5 text-[13px] transition-colors last:border-0 hover:bg-accented/30"
      >
        <span class="min-w-0">
          <UBadge color="neutral" variant="soft" class="text-xs">#{{ t.name }}</UBadge>
        </span>
        <span class="truncate text-xs text-muted">{{ usedOnLabel(t) }}</span>
        <span class="tnum text-right text-toned">{{ t.entryCount }}</span>
        <span class="tnum text-right font-medium text-highlighted">
          {{ t.trackedSec ? formatDuration(t.trackedSec) : '—' }}
        </span>
        <span class="text-xs text-muted">{{ lastUsedLabel(t.lastUsed) }}</span>
        <div class="flex justify-end gap-0.5">
          <UButton
            icon="i-lucide-filter"
            color="neutral"
            variant="ghost"
            square
            title="Show entries"
            aria-label="Show entries with this tag"
            class="size-[30px] justify-center"
            @click="jumpToTime(t)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            square
            title="Delete tag (entries keep their time)"
            aria-label="Delete tag"
            class="size-[30px] justify-center text-dimmed hover:text-primary"
            @click="removeTag(t)"
          />
        </div>
      </div>

      <p v-if="!catalog.tags.length" class="px-[22px] py-8 text-center text-[13px] text-muted">
        No tags yet — add one above, or type <b class="font-medium text-toned">#tag</b> when naming an entry.
      </p>
    </div>

    <div class="text-xs text-muted">
      Deleting a tag only strips the label from its entries — never the time.
      Merge two tags by renaming one to the other.
    </div>
  </div>
</template>
