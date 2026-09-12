<script setup lang="ts">
// Bulk-action bar shown above the groups when ≥1 row is selected.
// "n selected · Clear · Mark billable · Move to… · Delete". Delete goes through
// a confirmation dialog stating count and total hours (Rule 4), then emits
// so the page can run the bulk delete and show the undo toast. "Move to…"
// opens the picker in bulk mode (target 'bulk'); the picker runs the reassign.
const entriesStore = useEntriesStore()
const ui = useUiStore()

const emit = defineEmits<{ delete: [] }>()

const confirmOpen = ref(false)

const count = computed(() => entriesStore.selection.size)

const totalSec = computed(() =>
  entriesStore.entries
    .filter(e => entriesStore.selection.has(e.id))
    .reduce((a, e) => a + e.durationSec, 0)
)

const confirmTitle = computed(() => `Delete ${count.value} ${count.value === 1 ? 'entry' : 'entries'}?`)

const confirmBody = computed(() =>
  `${formatDuration(totalSec.value)} of tracked time across ${count.value} `
  + `${count.value === 1 ? 'entry' : 'entries'}. They sit in the trash for 30 days — `
  + 'restore from Settings → Trash.'
)

async function markBillable() {
  try {
    await entriesStore.bulkBillable(true)
  } catch {
    // amounts re-resolve server-side; a failed call leaves selection intact
  }
}

function confirmDelete() {
  confirmOpen.value = false
  emit('delete')
}
</script>

<template>
  <div class="tick-rise flex items-center gap-2.5 rounded-md bg-primary/10 py-1.5 pr-1.5 pl-3.5 ring-1 ring-primary/25">
    <span class="flex-1 text-[13px] text-primary">{{ count }} selected</span>
    <UButton color="primary" variant="ghost" size="sm" label="Clear" @click="entriesStore.clearSelection()" />
    <UButton color="neutral" variant="outline" size="sm" label="Mark billable" @click="markBillable" />
    <UButton
      color="neutral"
      variant="outline"
      size="sm"
      icon="i-lucide-folder-input"
      label="Move to…"
      @click="ui.openPicker('bulk', 'project')"
    />
    <UButton
      color="primary"
      variant="outline"
      size="sm"
      icon="i-lucide-trash-2"
      label="Delete"
      @click="confirmOpen = true"
    />

    <UModal v-model:open="confirmOpen" :title="confirmTitle">
      <template #body>
        <p class="text-sm text-muted">{{ confirmBody }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Keep them" @click="confirmOpen = false" />
          <UButton color="primary" variant="outline" label="Move to trash" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
