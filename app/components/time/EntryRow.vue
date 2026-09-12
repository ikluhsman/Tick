<script setup lang="ts">
// One entry row on the Time page.
// Grid: checkbox | name + chain | time range | $ toggle | duration + amount | actions.
// Selection + billable talk to the entries store directly; delete bubbles up
// so the page can show the undo toast (Rule 4); ▶ copies name/ref/billable
// onto the timer and starts it; ✎ (and clicking the name) opens the
// Manual-entry dialog in edit mode via ui.openEdit.
import type { EntryDto } from '#shared/types'

const props = withDefaults(
  defineProps<{
    entry: EntryDto
    /** First row of its card — skips the inset separator line. */
    first?: boolean
    /** Preference: show the $ amount under the duration. */
    showAmounts?: boolean
  }>(),
  { first: false, showAmounts: true }
)

const emit = defineEmits<{ delete: [] }>()

const entriesStore = useEntriesStore()
const timer = useTimerStore()
const ui = useUiStore()

const selected = computed(() => entriesStore.selection.has(props.entry.id))

/** Chain parts, deepest first: Task · Project · Client (client in accent). */
const chainParts = computed(() => {
  const r = props.entry.ref
  if (!r) return []
  const parts: { label: string, cls: string }[] = []
  if (r.taskName) parts.push({ label: r.taskName, cls: 'text-toned' })
  if (r.projectName) parts.push({ label: r.projectName, cls: r.taskName ? 'text-muted' : 'text-toned' })
  if (r.clientName) parts.push({ label: r.clientName, cls: 'text-primary' })
  return parts
})

const billTitle = computed(() => {
  if (!props.entry.billable) return 'Not billable'
  return props.entry.resolvedRate != null ? `Billable at $${props.entry.resolvedRate}/h` : 'Billable'
})

const busy = ref(false)

async function toggleBillable() {
  if (busy.value) return
  busy.value = true
  try {
    await entriesStore.updateEntry(props.entry.id, { billable: !props.entry.billable })
  } catch {
    // leave as-is; server state wins
  } finally {
    busy.value = false
  }
}

/** ▶ Start again — stop anything running, then start with this entry's name/ref/billable. */
async function startAgain() {
  if (busy.value) return
  busy.value = true
  try {
    if (timer.running) {
      const dto = await timer.stop()
      if (dto) entriesStore.applyStoppedEntry(dto)
    }
    await timer.start({
      name: props.entry.name,
      refType: props.entry.ref?.refType,
      refId: props.entry.ref?.refId,
      billable: props.entry.billable
    })
  } catch {
    await timer.hydrate()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="group grid grid-cols-[30px_minmax(0,1fr)_auto_auto_auto_94px] items-center gap-[11px] py-[9px] pr-2 pl-1.5 transition-colors"
    :class="selected ? 'bg-primary/10' : 'hover:bg-[color-mix(in_srgb,var(--ui-text)_4%,transparent)]'"
    :style="first ? undefined : { boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--ui-text) 6%, transparent)' }"
  >
    <!-- Select -->
    <UCheckbox
      :model-value="selected"
      aria-label="Select entry"
      class="ml-1.5"
      :ui="{ base: 'size-[18px] rounded-sm' }"
      @update:model-value="entriesStore.toggleSelect(entry.id)"
    />

    <!-- Name + tags, chain beneath -->
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="min-w-0 cursor-pointer truncate text-left text-sm text-highlighted hover:underline"
          title="Edit entry"
          @click="ui.openEdit(entry)"
        >
          {{ entry.name }}
        </button>
        <UBadge
          v-for="t in entry.tags"
          :key="t"
          color="neutral"
          variant="soft"
          class="shrink-0 px-[7px] py-px text-[10px]"
        >
          #{{ t }}
        </UBadge>
      </div>
      <div v-if="chainParts.length" class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span
          class="size-[7px] shrink-0 rounded-full"
          :style="{ background: clientColorVar(entry.ref?.clientColor) }"
        />
        <template v-for="(part, i) in chainParts" :key="i">
          <span class="whitespace-nowrap" :class="part.cls">{{ part.label }}</span>
          <span v-if="i < chainParts.length - 1" class="opacity-40">·</span>
        </template>
      </div>
    </div>

    <!-- Time range -->
    <span class="tnum whitespace-nowrap text-xs text-muted">
      {{ formatRange(entry.start, entry.end ?? entry.start) }}
    </span>

    <!-- Billable toggle (26px square, outlined $) -->
    <UTooltip :text="billTitle">
      <UButton
        square
        variant="outline"
        :color="entry.billable ? 'primary' : 'neutral'"
        icon="i-lucide-dollar-sign"
        :aria-pressed="entry.billable"
        :aria-label="billTitle"
        class="size-[26px] justify-center"
        :class="entry.billable ? '' : 'text-dimmed'"
        :ui="{ leadingIcon: 'size-[13px]' }"
        @click="toggleBillable"
      />
    </UTooltip>

    <!-- Duration + amount -->
    <div class="min-w-[84px] text-right">
      <div class="tnum text-sm font-medium text-highlighted">{{ formatDuration(entry.durationSec) }}</div>
      <div v-if="showAmounts" class="tnum text-[11px] text-muted">
        {{ entry.billable && entry.amount != null ? formatMoney(entry.amount) : '—' }}
      </div>
    </div>

    <!-- Row actions -->
    <div class="flex gap-0.5">
      <UButton
        icon="i-lucide-play"
        color="neutral"
        variant="ghost"
        square
        title="Start again"
        aria-label="Start again"
        class="size-[30px] justify-center"
        :ui="{ leadingIcon: 'size-[13px]' }"
        @click="startAgain"
      />
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="ghost"
        square
        title="Edit entry"
        aria-label="Edit entry"
        class="size-[30px] justify-center"
        :ui="{ leadingIcon: 'size-[13px]' }"
        @click="ui.openEdit(entry)"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        square
        title="Delete (undo available)"
        aria-label="Delete entry"
        class="size-[30px] justify-center text-dimmed hover:text-primary"
        :ui="{ leadingIcon: 'size-3.5' }"
        @click="emit('delete')"
      />
    </div>
  </div>
</template>
