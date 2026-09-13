<script setup lang="ts">
// Bulk-action bar shown above the groups when ≥1 row is selected.
// "n selected · Clear · Mark billable · Move to… · Delete". Delete goes through
// a confirmation dialog stating count and total hours (Rule 4), then emits
// so the page can run the bulk delete and show the undo toast. "Move to…"
// opens the picker in bulk mode (target 'bulk'); the picker runs the reassign.
//
// time.vue mounts TWO of these behind opposite `lg:hidden`/`max-lg:hidden`
// classes — one before the entry groups (desktop, in-flow, exactly as
// before), one after them (mobile: DOM/tab order then reads rows → bar,
// matching where it visually sits, fixed above the dock — WCAG 2.4.3).
// `display:none` drops whichever copy isn't for the current breakpoint out
// of both the tab order and the accessibility tree, so only one is ever
// live at a time — including its confirm-delete dialog, since that dialog
// can only open from a click on a bar a user can actually see.
const props = defineProps<{ mobile?: boolean }>()
const entriesStore = useEntriesStore()
const ui = useUiStore()

const emit = defineEmits<{ delete: [] }>()

const rootEl = ref<HTMLElement | null>(null)

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

// After "Move to trash" the bar unmounts, so the dialog must not try to hand
// focus back to its (vanishing) trigger — the page moves focus to the list.
let deleting = false

function confirmDelete() {
  deleting = true
  confirmOpen.value = false
  emit('delete')
}

function onCloseAutoFocus(e: Event) {
  if (!deleting) return
  deleting = false
  e.preventDefault()
}

// ── Keep a keyboard-focused row from landing under the fixed bar/dock ──────
// Only the `mobile` copy is ever actually `position: fixed` (its own
// `max-lg:fixed` class only takes effect below 1024px — see the desktop
// copy's `max-lg:hidden`, which keeps it in-flow and never fixed at all).
// Measuring THIS element's own top edge — rather than re-deriving "150px
// dock + safe-area + 8px gap" in JS — automatically covers the dock below
// it too, and stays right if either one's height ever changes, including the
// bar wrapping to a second line of buttons on a narrow phone.
let ro: ResizeObserver | undefined

function syncScrollPadding() {
  if (!props.mobile || !rootEl.value) return
  const rect = rootEl.value.getBoundingClientRect()
  if (rect.height === 0) {
    // `lg:hidden` — not the active breakpoint's copy right now.
    document.documentElement.style.removeProperty('--tick-obscured-bottom')
    return
  }
  const obscured = Math.max(0, window.innerHeight - rect.top)
  document.documentElement.style.setProperty('--tick-obscured-bottom', `${obscured}px`)
}

onMounted(() => {
  if (!props.mobile) return
  syncScrollPadding()
  ro = new ResizeObserver(syncScrollPadding)
  ro.observe(rootEl.value!)
  window.addEventListener('resize', syncScrollPadding, { passive: true })
})

onBeforeUnmount(() => {
  if (!props.mobile) return
  ro?.disconnect()
  window.removeEventListener('resize', syncScrollPadding)
  document.documentElement.style.removeProperty('--tick-obscured-bottom')
})
</script>

<template>
  <!-- <1024px: the `mobile` copy (time.vue) renders AFTER the entry groups —
       tab order then reads rows → bar, matching where this sits visually —
       but is taken out of flow so a bottom-sticky position never re-enters
       the viewport once scrolled past (it could only move up, never back
       down, if it stayed in-flow at the top): fixed above the mobile dock
       (docked timer card + tab bar). 150px + safe-area matches the bottom
       padding app/layouts/default.vue reserves for that dock; +8px is
       breathing room. flex-wrap + the count's own line keep Delete from
       running off a 390px screen once four buttons + the count can't share
       one row. bg-default keeps it opaque over the rows it now floats above
       (the primary/25 ring stands in for the desktop tint). -->
  <div
    ref="rootEl"
    role="region"
    aria-label="Bulk actions"
    data-selection-bar
    class="tick-rise flex flex-wrap items-center gap-2.5 rounded-md bg-primary/10 py-1.5 pr-1.5 pl-3.5 ring-1 ring-primary/25 max-lg:fixed max-lg:inset-x-4 max-lg:bottom-[calc(150px+env(safe-area-inset-bottom)+8px)] max-lg:z-30 max-lg:bg-default max-lg:shadow-lg"
  >
    <!-- Visual only — time.vue owns an always-mounted live region for count
         changes, since this span mounts together with the bar itself and
         would miss the first "n selected". -->
    <span class="flex-1 text-[13px] text-primary max-lg:basis-full">{{ count }} selected</span>
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

    <UModal v-model:open="confirmOpen" :title="confirmTitle" :content="{ onCloseAutoFocus }">
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
