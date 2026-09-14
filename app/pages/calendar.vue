<script setup lang="ts">
// Calendar page — Week/Day segmented control, ‹ Today › nav, range title, and
// the grid (drag-create → New-entry dialog prefilled with the dragged slot).
// Max-width 1200 (wider than other pages, per the mock). The picker modal is
// mounted here for the dialog's ref field; the timer bar shares it while the
// page is open.
import type { EntryDto } from '#shared/types'

useHead({ title: 'Calendar · Tick' })

const calendar = useCalendarStore()
const ui = useUiStore()
// True only on the first mount after a server render — the calendar state
// (including `anchor`) then came from the SSR payload, computed in the
// server's timezone. Read before the await below, while it is still set.
const hydrating = useNuxtApp().isHydrating
const entriesStore = useEntriesStore()
const { showUndoToast } = useUndoToast()

// Clicking a block opens the Time page's edit dialog (mounted below). It saves
// through the entries store, which the grid doesn't read — so refetch the
// visible range once the dialog closes and re-render the block.
watch(() => ui.editEntry, (open, was) => {
  if (was && !open) calendar.fetchRange().catch(() => {})
})

// The editEntry watcher's refetch runs before this DELETE settles, so refetch
// again after it and after an Undo.
async function onDialogDelete(entry: EntryDto) {
  try {
    const result = await entriesStore.remove(entry.id)
    calendar.fetchRange().catch(() => {})
    showUndoToast(`Deleted “${entry.name}”`, async () => {
      await entriesStore.restore(result).catch(() => {})
      await calendar.fetchRange().catch(() => {})
    })
  } catch {
    // request failed; the block stays and nothing else changed
  }
}

// SSR-hydrated grid: fetch on the server (state rides the Pinia payload, so
// hydration re-fetches nothing unless the browser's timezone differs from the
// server's — see onMounted) and again on every later client-side visit.
await useAsyncData('calendar-entries', async () => {
  await calendar.fetchRange()
  return true
})

onMounted(() => {
  const rangeBefore = calendar.rangeStart
  // The server anchored the grid on *its* day (UTC in the container), which a
  // browser behind it reads as yesterday — so the grid opens on the wrong day,
  // or the wrong week, with none of today's entries until a nav button moves
  // the anchor (ticktimer/Tick#29). Post-mount, so hydration still matches the
  // SSR markup.
  if (hydrating) calendar.localizeAnchor()
  // Mobile defaults to Day view (README §Mobile); the segmented control still
  // switches. Post-mount so SSR markup (week) hydrates cleanly — the range
  // watcher below then fetches the day view.
  if (window.innerWidth < 1024 && calendar.view === 'week') calendar.setView('day')
  // Re-anchoring usually moves the range and the watcher refetches. When it
  // doesn't (a timezone whose week matches the server's), the entries still
  // came from the server's window — shifted by its offset — so refetch here.
  if (hydrating && calendar.rangeStart === rangeBefore) calendar.fetchRange().catch(() => {})
})

watch(() => [calendar.rangeStart, calendar.rangeEnd], () => {
  calendar.fetchRange().catch(() => {})
})

// ── Header copy ─────────────────────────────────────────────────────────────
const title = computed(() => {
  if (calendar.view === 'day') return formatDateLong(calendar.anchor)
  const a = new Date(calendar.rangeStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const b = new Date(calendar.rangeStart + 6 * 86_400_000)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${a} – ${b}`
})

const summary = computed(() => {
  const totalSec = calendar.entries.reduce((acc, e) => acc + e.durationSec, 0)
  if (calendar.view === 'day') return `${formatDuration(totalSec)} · ${formatDayLabel(calendar.anchor)}`
  const w = calendar.weekOffset
  const rel = w === 0
    ? 'current week'
    : w === -1
      ? 'last week'
      : `${Math.abs(w)} weeks ${w < 0 ? 'ago' : 'ahead'}`
  return `${formatDuration(totalSec)} this week · ${rel}`
})

// ── Drag-to-create → prefilled dialog ───────────────────────────────────────
const dialogOpen = ref(false)
const prefill = ref<{ date: string, start: string, end: string } | null>(null)

/** Keyboard alternative to drag-create: the same dialog, date defaults to today. */
function onCreateFromKeyboard() {
  prefill.value = null
  dialogOpen.value = true
}

function onCreate({ day, startMin, endMin }: { day: number, startMin: number, endMin: number }) {
  const d = new Date(day)
  prefill.value = {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    start: formatTime(day + startMin * 60_000),
    end: formatTime(day + endMin * 60_000)
  }
  dialogOpen.value = true
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1200px] flex-col gap-[17px] px-[22px] pt-[22px] pb-[120px]">
    <!-- Header -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-[200px] flex-1">
        <h1 class="text-[28px] font-medium text-highlighted">Calendar</h1>
        <p class="tnum text-[13px] text-muted">{{ summary }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <!-- Keyboard route to "create": drag-to-create is pointer-only, so this
             button is visually hidden until it takes keyboard focus -->
        <UButton
          color="primary"
          variant="outline"
          icon="i-lucide-plus"
          label="New entry"
          class="sr-only focus-visible:not-sr-only"
          @click="onCreateFromKeyboard"
        />
        <UFieldGroup>
          <UButton
            label="Week"
            variant="outline"
            :color="calendar.view === 'week' ? 'primary' : 'neutral'"
            :class="calendar.view === 'week' ? '' : 'text-muted'"
            :aria-pressed="calendar.view === 'week'"
            @click="calendar.setView('week')"
          />
          <UButton
            label="Day"
            variant="outline"
            :color="calendar.view === 'day' ? 'primary' : 'neutral'"
            :class="calendar.view === 'day' ? '' : 'text-muted'"
            :aria-pressed="calendar.view === 'day'"
            @click="calendar.setView('day')"
          />
        </UFieldGroup>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-chevron-left"
          :aria-label="calendar.view === 'week' ? 'Previous week' : 'Previous day'"
          @click="calendar.prev()"
        />
        <UButton color="neutral" variant="outline" label="Today" @click="calendar.today()" />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-chevron-right"
          :aria-label="calendar.view === 'week' ? 'Next week' : 'Next day'"
          @click="calendar.next()"
        />
        <span class="tnum min-w-[150px] text-[15px] font-medium text-highlighted">{{ title }}</span>
      </div>
    </div>

    <!-- Grid -->
    <CalendarGrid @create="onCreate" />

    <!-- New-entry dialog — the shared picker mounts in the default layout
         (after the page slot), teleport order layers it above this dialog -->
    <CalendarEntryDialog v-model:open="dialogOpen" :prefill="prefill" />

    <!-- Edit dialog for a clicked block (opens from ui.editEntry) -->
    <TimeManualEntryDialog @delete="onDialogDelete" />
  </div>
</template>
