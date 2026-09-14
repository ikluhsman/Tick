<script setup lang="ts">
// Time page — header with week subline, By day / By project segmented control,
// free-text filter (#tag @name), Manual entry button, selection bar, day/project
// groups of entry rows, empty state. Owns the delete flows' undo toasts (Rule 4),
// including the edit dialog's Delete.
import type { DeleteResult, EntryDto } from '#shared/types'

useHead({ title: 'Time · Tick' })

const entriesStore = useEntriesStore()
const ui = useUiStore()
const route = useRoute()

// ── Mobile (<1024px) "Select" mode ──────────────────────────────────────────
// Page state, not persisted: resets to off on remount. Turning it off, or
// leaving the page, drops any selection so it never lingers into a later
// visit or leaks into desktop-width bulk actions.
const selectMode = ref(false)

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) entriesStore.clearSelection()
}

onBeforeUnmount(() => {
  entriesStore.clearSelection()
})

// Always-mounted polite live region for selection-count changes. The bar's
// own visual "n selected" text is a child of the v-if'd bar, so a screen
// reader that hasn't attached to it yet by the time it mounts misses the
// first announcement; this one exists before the count ever changes.
const selectionAnnouncement = ref('')
watch(() => entriesStore.selection.size, (n, prev) => {
  if (n === prev) return
  selectionAnnouncement.value = n === 0 ? 'Selection cleared' : `${n} selected`
})

/**
 * Where to land focus once a bulk action (Clear, Mark billable, Move to…,
 * bulk Delete) empties the selection and the bar unmounts. In Select mode
 * the Select/Done toggle is a fixed, known landmark in the header; outside
 * it (desktop, where the checkbox column is always visible) fall back to
 * the first row, which is what main did before Select mode existed. No
 * `preventScroll` here — unlike the guard below, everything that reaches
 * this point is a deliberate action, so scrolling the new target into view
 * is wanted: it's what keeps the focus ring visible instead of landing
 * off-screen and looking like nothing happened.
 */
function focusAfterBarAction() {
  nextTick(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    const toggle = selectMode.value ? document.querySelector<HTMLElement>('[data-select-toggle]') : null
    const target = (toggle && toggle.offsetParent !== null ? toggle : null)
      ?? document.querySelector<HTMLElement>('[data-entry-name]')
      ?? document.getElementById('main')
    target?.focus()
  })
}

// Whenever the selection empties out from under a focused control inside the
// selection bar (Clear, Mark billable, Move to…) — not just the page's own
// bulk-delete path below, which already handles its own focus — land focus
// back on the page instead of letting it fall to <body>.
//
// Two guards, both load-bearing:
// - `singleDeleteInFlight`: a single row's own Delete button (EntryRow) can
//   also empty the selection when that row was the only one selected.
//   onDelete below already restores focus to the row's neighbour; without
//   this guard this watcher's nextTick can run first and steal focus to the
//   first row before the neighbour-restore gets a turn.
// - `wasInBar`: captured synchronously here, at this watcher's default 'pre'
//   flush timing — i.e. before the bar unmounts — because the "activeElement
//   fell to body" check below can't tell a real bar-control activation apart
//   from a plain checkbox uncheck. Reka's CheckboxRoot is a <button>, and
//   Safari/iOS/Firefox-macOS don't focus a button on click, so unchecking the
//   last selected row already leaves activeElement on <body> with no bar
//   control ever involved — without this guard that click would wrongly
//   scroll-jump focus up to the first row.
watch(() => entriesStore.hasSelection, (has, had) => {
  if (has || !had || singleDeleteInFlight) return
  const wasInBar = !!document.activeElement?.closest('[data-selection-bar]')
  if (!wasInBar) return
  focusAfterBarAction()
})

// ?filter=#design (Tags page filter-jump) seeds the filter input; watch covers
// repeat jumps while this page is already mounted.
watch(
  () => route.query.filter,
  (f) => {
    if (f != null) entriesStore.filter = String(f)
  },
  { immediate: true }
)

const DAY_MS = 86_400_000

// SSR-hydrated list: fetch on the server (state rides the Pinia payload, so
// hydration re-fetches nothing) and again on every later client-side visit.
await useAsyncData('time-entries', async () => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  await entriesStore.fetchRange(from.toISOString(), to.toISOString())
  return true
})

// ── Header subline: "{week total} this week · {billable} billable · {$} unbilled"
const weekSummary = computed(() => {
  const now = new Date()
  const dow = (now.getDay() + 6) % 7 // Mon = 0
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime()
  const weekEnd = weekStart + 7 * DAY_MS
  let totalSec = 0
  let billableSec = 0
  let unbilled = 0
  for (const e of entriesStore.entries) {
    const t = new Date(e.start).getTime()
    if (t < weekStart || t >= weekEnd) continue
    totalSec += e.durationSec
    if (e.billable) {
      billableSec += e.durationSec
      unbilled += e.amount ?? 0
    }
  }
  return `${formatDuration(totalSec)} this week · ${formatDuration(billableSec)} billable · ${formatMoney(unbilled)} unbilled`
})

// ── Groups (By day / By project) over the filtered list ─────────────────────
interface Group {
  key: string
  label: string
  sub: string
  totalSec: number
  entries: EntryDto[]
}

const groups = computed<Group[]>(() => {
  const list = [...entriesStore.filtered]
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  const map = new Map<string, EntryDto[]>()

  if (entriesStore.groupBy === 'day') {
    for (const e of list) {
      const k = new Date(e.start).toDateString()
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return [...map.values()].map(es => ({
      key: new Date(es[0]!.start).toDateString(),
      label: formatDayLabel(es[0]!.start),
      sub: formatDaySub(es[0]!.start),
      totalSec: es.reduce((a, e) => a + e.durationSec, 0),
      entries: es
    }))
  }

  // By project: project → client-only entries group under the client → "No project"
  for (const e of list) {
    const k = e.ref?.projectId ?? e.ref?.clientId ?? 'none'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(e)
  }
  return [...map.entries()].map(([key, es]) => {
    const r = es[0]!.ref
    return {
      key,
      label: r?.projectName ?? r?.clientName ?? 'No project',
      sub: r?.projectName && r?.clientName ? r.clientName : '',
      totalSec: es.reduce((a, e) => a + e.durationSec, 0),
      entries: es
    }
  })
})

// ── Row cap: each row mounts several Nuxt UI components (~4ms apiece on SSR
// and hydration), so a heavy month froze the page for seconds. Render the
// first ROW_PAGE rows across groups; group totals still cover every entry.
const ROW_PAGE = 150
const rowLimit = ref(ROW_PAGE)
watch(() => [entriesStore.filter, entriesStore.groupBy], () => { rowLimit.value = ROW_PAGE })

const totalRows = computed(() => groups.value.reduce((n, g) => n + g.entries.length, 0))
const hiddenRows = computed(() => Math.max(0, totalRows.value - rowLimit.value))

const visibleGroups = computed<Group[]>(() => {
  let budget = rowLimit.value
  const out: Group[] = []
  for (const g of groups.value) {
    if (budget <= 0) break
    out.push(g.entries.length <= budget ? g : { ...g, entries: g.entries.slice(0, budget) })
    budget -= g.entries.length
  }
  return out
})

function showMore() {
  const firstRevealed = rowLimit.value
  rowLimit.value += ROW_PAGE
  // The button may unmount (nothing left to show) — keep keyboard focus in
  // the list by landing on the first newly rendered row.
  nextTick(() => {
    if (document.activeElement?.isConnected && document.activeElement !== document.body) return
    document.querySelectorAll<HTMLElement>('[data-entry-name]')[firstRevealed]?.focus()
  })
}

// ── Delete flows + undo toast (Rule 4: countdown visible, Undo restores) ────
const { showUndoToast } = useUndoToast()

function undoToast(message: string, result: DeleteResult) {
  showUndoToast(message, () => entriesStore.restore(result).catch(() => {}))
}

/**
 * Keyboard focus must not fall to <body> when the focused row disappears:
 * pick the neighbouring row's name button (next, else previous) before the
 * delete, and move focus there once the row has unmounted. Only acts when
 * focus was inside the deleted row, so pointer users see no change.
 */
function focusNeighbourAfterRemoval(id: string): () => void {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-entry-id]')]
  const i = rows.findIndex(r => r.dataset.entryId === id)
  const row = rows[i]
  if (!row || !row.contains(document.activeElement)) return () => {}
  const target = (rows[i + 1] ?? rows[i - 1])?.querySelector<HTMLElement>('[data-entry-name]') ?? null
  return () => nextTick(() => {
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected) return
    ;(target?.isConnected ? target : document.getElementById('main'))?.focus()
  })
}

// Set for the span of a single-row delete so the hasSelection watcher above
// (fired by the same store mutation, when this row was the only one
// selected) doesn't race focusNeighbourAfterRemoval's own restore — see that
// watcher's comment.
let singleDeleteInFlight = false

async function onDelete(entry: EntryDto) {
  const restoreFocus = focusNeighbourAfterRemoval(entry.id)
  singleDeleteInFlight = true
  try {
    const result = await entriesStore.remove(entry.id)
    restoreFocus()
    undoToast(`Deleted “${entry.name}”`, result)
  } catch {
    // row stays; server said no
  } finally {
    singleDeleteInFlight = false
  }
}

async function onBulkDelete() {
  const count = entriesStore.selection.size
  try {
    const result = await entriesStore.bulkDelete()
    // The selection bar (and its Delete trigger) is gone — land back on the page
    focusAfterBarAction()
    if (result) undoToast(`Moved ${count} ${count === 1 ? 'entry' : 'entries'} to trash`, result)
  } catch {
    // selection stays for retry
  }
}
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-[1100px] flex-col gap-[17px] px-[22px] pt-[22px] pb-[120px]"
    :class="{ 'max-lg:pb-[200px]': entriesStore.hasSelection }"
  >
    <!-- Header -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-[200px] flex-1">
        <h1 class="text-[28px] font-medium text-highlighted">Time</h1>
        <p class="tnum text-[13px] text-muted">{{ weekSummary }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UFieldGroup>
          <UButton
            label="By day"
            variant="outline"
            :color="entriesStore.groupBy === 'day' ? 'primary' : 'neutral'"
            :class="entriesStore.groupBy === 'day' ? '' : 'text-muted'"
            :aria-pressed="entriesStore.groupBy === 'day'"
            @click="entriesStore.groupBy = 'day'"
          />
          <UButton
            label="By project"
            variant="outline"
            :color="entriesStore.groupBy === 'project' ? 'primary' : 'neutral'"
            :class="entriesStore.groupBy === 'project' ? '' : 'text-muted'"
            :aria-pressed="entriesStore.groupBy === 'project'"
            @click="entriesStore.groupBy = 'project'"
          />
        </UFieldGroup>
        <UInput
          v-model="entriesStore.filter"
          icon="i-lucide-search"
          placeholder="Filter, #tag, @project"
          aria-label="Filter entries — #tag, @project or text"
          class="w-60"
        />
        <UButton
          color="primary"
          variant="outline"
          icon="i-lucide-plus"
          label="Manual entry"
          @click="ui.openManual()"
        />
        <!-- Plain action button, not a toggle: the APG toggle-button pattern
             requires the label stay fixed across states, and this one reads
             "Done" while active by design (see docs) — aria-pressed alongside
             a changing label would announce a self-contradicting "Done …
             pressed". Select mode's own effect (row checkboxes, the bulk bar)
             communicates the state instead. -->
        <UButton
          color="neutral"
          variant="outline"
          class="lg:hidden"
          :class="selectMode ? '' : 'text-muted'"
          :label="selectMode ? 'Done' : 'Select'"
          data-select-toggle
          @click="toggleSelectMode"
        />
      </div>
    </div>

    <!-- Always mounted (unlike the bar's own visual count) so the very first
         "n selected" is never missed by a screen reader that hasn't attached
         to the bar yet. -->
    <div class="sr-only" role="status" aria-live="polite">{{ selectionAnnouncement }}</div>

    <!-- Selection bar — desktop copy: in-flow above the list, exactly as
         before. `max-lg:hidden` drops it (display:none, so out of both the
         tab order and the accessibility tree) below 1024px, where the
         `mobile` copy after the groups below takes over instead. See
         SelectionBar.vue's docblock for why two copies rather than one
         instance repositioned by JS. -->
    <TimeSelectionBar v-if="entriesStore.hasSelection" class="max-lg:hidden" @delete="onBulkDelete" />

    <!-- Groups -->
    <template v-if="groups.length">
      <TimeEntryGroup
        v-for="g in visibleGroups"
        :key="g.key"
        :label="g.label"
        :sub="g.sub"
        :total-sec="g.totalSec"
        :entries="g.entries"
        :select-mode="selectMode"
        @delete="onDelete"
      />
      <div v-if="hiddenRows" class="flex flex-col items-center gap-2 pt-1">
        <p class="tnum text-[13px] text-muted">
          Showing {{ rowLimit }} of {{ totalRows }} entries
        </p>
        <UButton
          color="neutral"
          variant="outline"
          :label="`Show ${Math.min(ROW_PAGE, hiddenRows)} more`"
          @click="showMore"
        />
      </div>
    </template>

    <!-- Empty state: filtered-to-nothing gets its own copy + a Clear filter action -->
    <div v-else class="rounded-lg bg-elevated p-[22px] text-center shadow-sm ring ring-default">
      <template v-if="entriesStore.filter.trim()">
        <h2 class="mb-1 text-lg font-medium text-highlighted">No entries match your filter</h2>
        <p class="mb-3 text-[13px] text-muted">
          Nothing matches “{{ entriesStore.filter.trim() }}” in the last 30 days.
        </p>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          label="Clear filter"
          @click="entriesStore.filter = ''"
        />
      </template>
      <template v-else>
        <h2 class="mb-1 text-lg font-medium text-highlighted">Nothing here yet</h2>
        <p class="text-[13px] text-muted">Start the timer above, or add a manual entry.</p>
      </template>
    </div>

    <!-- Selection bar — mobile copy: rendered AFTER the rows so Tab order is
         rows → bar, matching where it visually sits (fixed above the dock).
         `lg:hidden` keeps it out of the tab order/accessibility tree at
         1024px and up, where the desktop copy above is the live one. -->
    <TimeSelectionBar v-if="entriesStore.hasSelection" mobile class="lg:hidden" @delete="onBulkDelete" />

    <!-- Manual entry / edit dialog. The shared picker mounts in the default
         layout (after the page slot), so teleport order still layers it
         above this dialog. -->
    <TimeManualEntryDialog @delete="onDelete" />
  </div>
</template>
