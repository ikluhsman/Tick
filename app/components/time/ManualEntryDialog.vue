<script setup lang="ts">
// Manual entry dialog (560px). Free-text Date / Start / End / or Duration with
// a live interpretation line; picker-trigger styled as an input; billable
// toggle showing the client-side rate estimate (server re-resolves per Rule 2).
// Submits via entriesStore.addManual — the saved entry sorts into its day group.
import type { ChainRef, SessionUser } from '#shared/types'

const ui = useUiStore()
const entriesStore = useEntriesStore()
const catalog = useCatalogStore()
const { user } = useUserSession()

const open = computed({
  get: () => ui.manualOpen,
  set: (v: boolean) => {
    if (!v) ui.closeManual()
  }
})

const desc = ref('')
const refChain = ref<ChainRef | null>(null)
const billable = ref(true)
const dateInput = ref('')
const startInput = ref('')
const endInput = ref('')
const durInput = ref('')
const tagsInput = ref('')
const saving = ref(false)

const descInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('descInput')

// Fresh fields every time the dialog opens
watch(() => ui.manualOpen, (v) => {
  if (!v) return
  desc.value = ''
  refChain.value = null
  billable.value = true
  dateInput.value = ''
  startInput.value = ''
  endInput.value = ''
  durInput.value = ''
  tagsInput.value = ''
  saving.value = false
  ui.pickerResult = null
})

// Adopt what the picker chose for us (target 'manual'), then clear it.
// Billable defaults from the resolved project (Rule 2) when one is in the chain.
watch(() => ui.pickerResult, (r) => {
  if (!r || !ui.manualOpen || ui.pickerTarget !== 'manual') return
  refChain.value = r
  ui.pickerResult = null
  const projectId = r.refType === 'project' ? r.refId : r.projectId
  if (projectId) {
    const p = catalog.projects.find(x => x.id === projectId)
    if (p) billable.value = p.billableDefault
  }
})

const refLabel = computed(() => {
  const r = refChain.value
  if (!r) return 'None — simple entry'
  return [r.taskName, r.projectName, r.clientName].filter(Boolean).join(' · ') || 'None — simple entry'
})

/** Client-side rate estimate: client rate / project resolvedRate / user default. */
const resolvedRate = computed<number | null>(() => {
  const fallback = (user.value as SessionUser | null)?.defaultRate ?? null
  const r = refChain.value
  if (!r) return fallback
  if (r.refType === 'client') {
    return catalog.clients.find(c => c.id === r.refId)?.rate ?? fallback
  }
  const projectId = r.refType === 'project' ? r.refId : r.projectId
  if (projectId) {
    const p = catalog.projects.find(x => x.id === projectId)
    if (p) return p.resolvedRate ?? fallback
  }
  return fallback
})

const rateLabel = computed(() => {
  if (!billable.value) return 'Not billable'
  return resolvedRate.value != null ? `$${resolvedRate.value}/h` : 'Billable'
})

interface Parsed {
  valid: boolean
  text: string
  start?: Date
  end?: Date
}

/** Live interpretation of Date / Start / End / Duration (empty date = today). */
const parsed = computed<Parsed>(() => {
  const d = parseDate(dateInput.value)
  if (!d) return { valid: false, text: `Couldn't read “${dateInput.value.trim()}” as a date.` }

  const dateStr = formatDateLong(d)
  const start = parseTime(startInput.value)
  const end = parseTime(endInput.value)
  const dur = parseDuration(durInput.value)
  const at = (minutes: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes)

  if (start != null && end != null && end > start) {
    const s = at(start)
    const e = at(end)
    return { valid: true, start: s, end: e, text: `${dateStr} · ${formatRange(s, e)} · ${formatDuration((end - start) * 60)}` }
  }
  if (dur != null && dur > 0 && start != null) {
    const s = at(start)
    const e = at(start + dur)
    return { valid: true, start: s, end: e, text: `${dateStr} · ${formatRange(s, e)} · ${formatDuration(dur * 60)}` }
  }
  if (dur != null && dur > 0) {
    const s = at(9 * 60)
    const e = at(9 * 60 + dur)
    return { valid: true, start: s, end: e, text: `${dateStr} · ${formatDuration(dur * 60)} (no start time — logged from 9:00)` }
  }
  if (start != null && end != null) return { valid: false, text: `${dateStr} · end must be after start.` }
  return { valid: false, text: `${dateStr} · add a start + end, or a duration.` }
})

const tags = computed(() =>
  tagsInput.value
    .split(',')
    .map(t => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)
)

async function submit() {
  if (!parsed.value.valid || saving.value) return
  saving.value = true
  try {
    await entriesStore.addManual({
      name: desc.value.trim() || 'Untitled entry',
      refType: refChain.value?.refType,
      refId: refChain.value?.refId,
      billable: billable.value,
      start: parsed.value.start!.toISOString(),
      end: parsed.value.end!.toISOString(),
      tags: tags.value
    })
    ui.closeManual()
  } catch {
    saving.value = false
    return
  }
  saving.value = false
}

function onOpenAutoFocus(e: Event) {
  e.preventDefault()
  nextTick(() => descInput.value?.inputRef?.focus())
}
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-[560px]' }"
    :content="{ onOpenAutoFocus }"
    aria-label="Manual entry"
  >
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <h2 class="text-[17px] font-medium text-highlighted">Manual entry</h2>

        <UFormField label="What did you work on?">
          <UInput
            ref="descInput"
            v-model="desc"
            placeholder="e.g. Invoice reconciliation"
            class="w-full"
            @keydown.enter.prevent="submit"
          />
        </UFormField>

        <!-- Ref picker (button styled as input) + billable toggle -->
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
          <UFormField label="Client, project or task">
            <button
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded-md bg-default px-2.5 text-left text-sm ring ring-inset ring-accented transition-colors hover:bg-[color-mix(in_srgb,var(--ui-text)_4%,transparent)]"
              @click="ui.openPicker('manual', 'task')"
            >
              <span class="min-w-0 flex-1 truncate" :class="refChain ? 'text-highlighted' : 'text-dimmed'">
                {{ refLabel }}
              </span>
              <span
                v-if="refChain"
                role="button"
                tabindex="0"
                aria-label="Clear selection"
                class="flex size-[18px] shrink-0 items-center justify-center rounded-xs text-muted hover:text-highlighted"
                @click.stop="refChain = null"
                @keydown.enter.stop.prevent="refChain = null"
              >
                <UIcon name="i-lucide-x" class="size-3.5" />
              </span>
              <UIcon v-else name="i-lucide-search" class="size-3.5 shrink-0 opacity-60" />
            </button>
          </UFormField>
          <UButton
            variant="outline"
            :color="billable ? 'primary' : 'neutral'"
            icon="i-lucide-dollar-sign"
            :aria-pressed="billable"
            class="h-8"
            :class="billable ? '' : 'text-dimmed'"
            @click="billable = !billable"
          >
            <span class="tnum">{{ rateLabel }}</span>
          </UButton>
        </div>

        <!-- Date / Start / End / or Duration -->
        <div class="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr_1fr] gap-2.5">
          <UFormField label="Date — type it any way">
            <UInput v-model="dateInput" placeholder="2025-03-14, mar 14, last tue…" class="tnum w-full" />
          </UFormField>
          <UFormField label="Start">
            <UInput v-model="startInput" placeholder="9:00" class="tnum w-full" />
          </UFormField>
          <UFormField label="End">
            <UInput v-model="endInput" placeholder="11:30" class="tnum w-full" />
          </UFormField>
          <UFormField label="or Duration">
            <UInput v-model="durInput" placeholder="2h 30m" class="tnum w-full" />
          </UFormField>
        </div>

        <!-- Live interpretation -->
        <div
          class="flex items-center gap-2 rounded-md bg-elevated px-2.5 py-2 text-xs"
          :class="parsed.valid ? 'text-primary' : 'text-muted'"
          aria-live="polite"
        >
          <UIcon name="i-lucide-calendar" class="size-3.5 shrink-0" />
          <span class="tnum">{{ parsed.text }}</span>
        </div>

        <UFormField label="Tags">
          <UInput v-model="tagsInput" placeholder="design, qa" class="w-full" @keydown.enter.prevent="submit" />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" @click="ui.closeManual()" />
          <UButton
            color="primary"
            variant="outline"
            label="Add entry"
            :disabled="!parsed.valid"
            :loading="saving"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
