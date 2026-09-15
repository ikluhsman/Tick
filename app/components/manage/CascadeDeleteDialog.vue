<script setup lang="ts">
// Cascade delete dialog (README Rule 3). Reads useUiStore.cascade {open, kind, id}.
// Checkboxes cascade DOWNWARD (Projects ⇒ Tasks ⇒ Entries): checking a level
// auto-checks everything beneath it; unchecking a lower level unchecks the ones
// above. Counts come from GET /api/{kind}s/:id/cascade. An outcome panel spells
// out what happens to anything unchecked (incl. the resulting fallback $/h).
// Confirm → catalogStore delete with flags → undo toast → POST /api/restore.

import type { CascadeDeleteResult } from '~/stores/catalog'

type Level = 'projects' | 'tasks' | 'entries'

const ui = useUiStore()
const catalog = useCatalogStore()
const entriesStore = useEntriesStore()
const session = useUserSession()
const toast = useToast()

// Snapshot of the target taken when the dialog opens (survives closeCascade clearing the id)
const target = ref<{ kind: 'client' | 'project', id: string, name: string } | null>(null)
const counts = ref<CascadeCounts | null>(null)
const checks = ref<Record<Level, boolean>>({ projects: false, tasks: false, entries: false })
const busy = ref(false)

const open = computed({
  get: () => ui.cascade.open,
  set: (v) => { if (!v) ui.closeCascade() }
})

watch(() => ui.cascade.open, async (isOpen) => {
  if (!isOpen || !ui.cascade.id) return
  const kind = ui.cascade.kind
  const id = ui.cascade.id
  const name = kind === 'client'
    ? catalog.clients.find(c => c.id === id)?.name ?? 'client'
    : catalog.projects.find(p => p.id === id)?.name ?? 'project'
  target.value = { kind, id, name }
  checks.value = { projects: false, tasks: false, entries: false }
  counts.value = null
  try {
    counts.value = kind === 'client'
      ? await catalog.clientCascade(id)
      : await catalog.projectCascade(id)
  } catch {
    counts.value = { projects: 0, tasks: 0, entries: 0 }
  }
})

const kind = computed(() => target.value?.kind ?? 'client')

// Project-kind dialogs only show Tasks/Entries rows
const levels = computed<Level[]>(() =>
  kind.value === 'client' ? ['projects', 'tasks', 'entries'] : ['tasks', 'entries']
)

const rows = computed(() => {
  const meta: Record<Level, { label: string, hint: string }> = {
    projects: { label: 'Projects', hint: 'and all their tasks and entries' },
    tasks: { label: 'Tasks', hint: 'and every entry logged on them' },
    entries: { label: 'Time entries', hint: `anything that resolves to this ${kind.value}` }
  }
  return levels.value.map(key => ({ key, ...meta[key] }))
})

/** Checking a level takes everything beneath it; unchecking a level releases the ones above. */
function toggle(level: Level) {
  const order = levels.value
  const i = order.indexOf(level)
  const next = { ...checks.value, [level]: !checks.value[level] }
  if (next[level]) {
    for (let j = i + 1; j < order.length; j++) next[order[j]!] = true
  } else {
    for (let j = 0; j < i; j++) next[order[j]!] = false
  }
  checks.value = next
}

const userRate = computed(() => (session.user.value as SessionUser | null)?.defaultRate ?? null)

const bodyCopy = computed(() => kind.value === 'client'
  ? 'Choose what goes with it. Ticking a level takes everything beneath it — a project’s tasks and entries go with the project.'
  : 'Choose what goes with it. Ticking a level takes everything beneath it — a task’s entries go with the task.')

// Outcome panel: consequences for every unchecked row, incl. resulting $/h fallback
const outcome = computed(() => {
  const c = counts.value
  if (!c) return ['Counting what depends on it…']
  const k = checks.value
  const lines: string[] = []
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const fallback = userRate.value != null ? `the $${userRate.value}/h default rate` : 'your default rate'

  if (kind.value === 'client' && !k.projects && c.projects) {
    lines.push(`${plural(c.projects, 'project', 'projects')} kept — client cleared, so they’ll fall back to ${fallback}.`)
  }
  if (!k.tasks && c.tasks) {
    if (kind.value === 'client') {
      lines.push(`${plural(c.tasks, 'task', 'tasks')} kept ${k.projects ? 'as standalone tasks' : 'under their projects'}.`)
    } else {
      lines.push(`${plural(c.tasks, 'task', 'tasks')} kept — they become standalone tasks, falling back to ${fallback} unless they have their own rate.`)
    }
  }
  if (!k.entries && c.entries) {
    lines.push(`${plural(c.entries, 'entry', 'entries')} kept — the time stays in reports, unassigned to any ${kind.value}.`)
  }
  if (k.entries && c.entries) {
    lines.push(`${plural(c.entries, 'entry', 'entries')} move${c.entries === 1 ? 's' : ''} to the trash with the ${kind.value}.`)
  }
  if (!lines.length) lines.push('Nothing else is affected.')
  return lines
})

async function undoRestore(result: CascadeDeleteResult) {
  // One id, not the operation's every uuid: the server un-trashes each row it
  // stamped and re-applies the refs the delete cleared (kept project → client,
  // etc.) from its own copy of the relink snapshot. Posting the snapshot back
  // silently restored nothing past ~10k entries (ticktimer/Tick#11).
  await $fetch('/api/restore', { method: 'POST', body: { batchId: result.batchId } })
  await catalog.fetchAll()
  await entriesStore.refresh().catch(() => {})
}

async function confirm() {
  const t = target.value
  if (!t || busy.value) return
  busy.value = true
  try {
    const result = t.kind === 'client'
      ? await catalog.removeClient(t.id, {
          cascadeProjects: checks.value.projects,
          cascadeTasks: checks.value.tasks,
          cascadeEntries: checks.value.entries
        })
      : await catalog.removeProject(t.id, {
          cascadeTasks: checks.value.tasks,
          cascadeEntries: checks.value.entries
        })
    ui.closeCascade()
    await entriesStore.refresh().catch(() => {})
    toast.add({
      title: `Deleted ${t.name}`,
      description: 'In the trash for 30 days — restore from Settings → Trash.',
      icon: 'i-lucide-trash-2',
      duration: ui.undoSeconds * 1000, // Rule 4: 3–30s, Settings → Profile
      actions: [{
        label: 'Undo',
        color: 'primary',
        variant: 'outline',
        onClick: () => undoRestore(result)
      }]
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-[500px]' }"
    :title="`Delete ${target?.name ?? kind}?`"
    :description="bodyCopy"
  >
    <template #content>
      <div class="flex flex-col gap-3 p-[17px]">
        <!-- Dialog name/description come from :title/:description (Nuxt UI's aria-hidden DialogTitle/Description) -->
        <h2 class="text-[17px] font-medium text-highlighted">Delete {{ target?.name }}?</h2>
        <p class="text-[13px] leading-relaxed text-muted">{{ bodyCopy }}</p>

        <!-- Cascading checkboxes -->
        <div class="flex flex-col gap-0.5" role="group" aria-label="Also move to trash">
          <button
            v-for="row in rows"
            :key="row.key"
            type="button"
            class="grid cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2.5 py-[9px] text-left transition-colors"
            :class="checks[row.key] ? 'bg-primary/10' : 'hover:bg-accented/40'"
            role="checkbox"
            :aria-checked="checks[row.key]"
            @click="toggle(row.key)"
          >
            <span
              aria-hidden="true"
              class="grid size-4 place-items-center rounded-sm border-[1.5px] transition-colors"
              :class="checks[row.key] ? 'border-primary bg-primary text-inverted' : 'border-accented'"
            >
              <UIcon v-if="checks[row.key]" name="i-lucide-check" class="size-2.5" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm text-highlighted">{{ row.label }}</span>
              <span class="block text-xs text-muted">{{ row.hint }}</span>
            </span>
            <UBadge color="neutral" variant="soft" class="tnum">
              {{ counts ? counts[row.key] : '…' }}
            </UBadge>
          </button>
        </div>

        <!-- Outcome panel -->
        <div class="flex flex-col gap-1 rounded-md bg-default px-2.5 py-2 text-xs text-toned" aria-live="polite">
          <span v-for="(line, i) in outcome" :key="i">{{ line }}</span>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <UButton
            color="neutral"
            variant="outline"
            :label="`Keep ${kind}`"
            @click="ui.closeCascade()"
          />
          <UButton
            color="primary"
            variant="outline"
            label="Move to trash"
            :loading="busy"
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
