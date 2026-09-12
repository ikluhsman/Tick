<script setup lang="ts">
// Time page — header with week subline, By day / By project segmented control,
// free-text filter (#tag @name), Manual entry button, selection bar, day/project
// groups of entry rows, empty state. Owns the delete flows' undo toasts (Rule 4).
import type { DeleteResult, EntryDto } from '#shared/types'

useHead({ title: 'Time · Tick' })

const entriesStore = useEntriesStore()
const ui = useUiStore()
const toast = useToast()
const route = useRoute()

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
const UNDO_SECONDS = 8

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

// ── Delete flows + undo toast (Rule 4: countdown visible, Undo restores) ────
function undoToast(message: string, result: DeleteResult) {
  const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let left = UNDO_SECONDS
  const tick = setInterval(() => {
    left -= 1
    if (left <= 0) {
      clearInterval(tick)
      return
    }
    // Countdown is plain text only. duration must be re-passed unchanged:
    // update() hard-sets it from this patch, so omitting it would drop the
    // toast to the provider default mid-count and passing a shrinking value
    // pushes progress past 100 (ProgressRoot "Invalid prop" spam). A constant
    // value never re-triggers reka's [open, duration] watch, so the 8s close
    // timer started by add() keeps running untouched.
    toast.update(id, { description: `Undo within ${left}s`, duration: UNDO_SECONDS * 1000 })
  }, 1000)

  toast.add({
    id,
    title: message,
    description: `Undo within ${left}s`,
    icon: 'i-lucide-trash-2',
    color: 'neutral',
    duration: UNDO_SECONDS * 1000,
    actions: [{
      label: 'Undo',
      color: 'primary',
      variant: 'outline',
      onClick: () => {
        clearInterval(tick)
        entriesStore.restore(result).catch(() => {})
      }
    }]
  })
}

async function onDelete(entry: EntryDto) {
  try {
    const result = await entriesStore.remove(entry.id)
    undoToast(`Deleted “${entry.name}”`, result)
  } catch {
    // row stays; server said no
  }
}

async function onBulkDelete() {
  const count = entriesStore.selection.size
  try {
    const result = await entriesStore.bulkDelete()
    if (result) undoToast(`Moved ${count} ${count === 1 ? 'entry' : 'entries'} to trash`, result)
  } catch {
    // selection stays for retry
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1100px] flex-col gap-[17px] px-[22px] pt-[22px] pb-[120px]">
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
            @click="entriesStore.groupBy = 'day'"
          />
          <UButton
            label="By project"
            variant="outline"
            :color="entriesStore.groupBy === 'project' ? 'primary' : 'neutral'"
            :class="entriesStore.groupBy === 'project' ? '' : 'text-muted'"
            @click="entriesStore.groupBy = 'project'"
          />
        </UFieldGroup>
        <UInput
          v-model="entriesStore.filter"
          icon="i-lucide-search"
          placeholder="Filter, #tag, @project"
          class="w-60"
        />
        <UButton
          color="primary"
          variant="outline"
          icon="i-lucide-plus"
          label="Manual entry"
          @click="ui.openManual()"
        />
      </div>
    </div>

    <!-- Selection bar -->
    <TimeSelectionBar v-if="entriesStore.hasSelection" @delete="onBulkDelete" />

    <!-- Groups -->
    <template v-if="groups.length">
      <TimeEntryGroup
        v-for="g in groups"
        :key="g.key"
        :label="g.label"
        :sub="g.sub"
        :total-sec="g.totalSec"
        :entries="g.entries"
        @delete="onDelete"
      />
    </template>

    <!-- Empty state: filtered-to-nothing gets its own copy + a Clear filter action -->
    <div v-else class="rounded-lg bg-elevated p-[22px] text-center shadow-sm ring ring-default">
      <template v-if="entriesStore.filter.trim()">
        <h3 class="mb-1 text-lg font-medium text-highlighted">No entries match your filter</h3>
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
        <h3 class="mb-1 text-lg font-medium text-highlighted">Nothing here yet</h3>
        <p class="text-[13px] text-muted">Start the timer above, or add a manual entry.</p>
      </template>
    </div>

    <!-- Manual entry / edit dialog. The shared picker mounts in the default
         layout (after the page slot), so teleport order still layers it
         above this dialog. -->
    <TimeManualEntryDialog />
  </div>
</template>
