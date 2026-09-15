<script setup lang="ts">
// Task form (README "Projects & tasks" forms): name, project picker, rate,
// free-text estimate, completed. Edit mode adds Delete (soft delete + undo
// toast, Rule 4).

import type { TaskPayload } from '~/stores/catalog'

const props = defineProps<{
  task?: TaskDto | null
  /** Preselects the project when opened from a project card's "+ Add task". */
  presetProjectId?: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

const catalog = useCatalogStore()
const toast = useToast()
const ui = useUiStore()
const session = useUserSession()

const name = ref('')
const projectId = ref<string | null>(null)
const rateRaw = ref('')
const estimateRaw = ref('')
const done = ref(false)
const busy = ref(false)

watch(open, (v) => {
  if (!v) return
  const t = props.task
  name.value = t?.name ?? ''
  projectId.value = t?.projectId ?? props.presetProjectId ?? null
  rateRaw.value = t?.rate != null ? String(t.rate) : ''
  estimateRaw.value = t?.estimateMinutes ? formatEstimate(t.estimateMinutes) : ''
  done.value = t?.done ?? false
})

const projectItems = computed(() => [
  { label: 'No project — standalone', value: null as string | null },
  ...catalog.projects
    .filter(p => !p.archived)
    .map(p => ({ label: p.name, value: p.id as string | null }))
])

// Rate — optional; placeholder shows what an empty field inherits (Rule 2),
// from the currently selected project's already-resolved rate, or the user's
// default rate when standalone.
const userRate = computed(() => (session.user.value as SessionUser | null)?.defaultRate ?? null)

const selectedProject = computed(() =>
  projectId.value ? catalog.projects.find(p => p.id === projectId.value) ?? null : null
)

const inheritedRate = computed(() => {
  const p = selectedProject.value
  if (p) {
    if (p.resolvedRate == null || p.rateSource === 'none') return ''
    if (p.rateSource === 'project') return `$${p.resolvedRate}/h from project`
    if (p.rateSource === 'client') return `$${p.resolvedRate}/h from client`
    return `$${p.resolvedRate}/h default`
  }
  return userRate.value != null ? `$${userRate.value}/h default` : ''
})

/** null = empty, undefined = invalid */
const rateNum = computed<number | null | undefined>(() => {
  const t = rateRaw.value.trim().replace(/^\$/, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
})

/** null = empty, undefined = unparseable */
const estimateMinutes = computed<number | null | undefined>(() => {
  const t = estimateRaw.value.trim()
  if (!t) return null
  const min = parseEstimate(t)
  return min == null ? undefined : min
})

const estimateError = computed(() =>
  estimateMinutes.value === undefined ? `Couldn't read “${estimateRaw.value.trim()}” as a duration.` : undefined
)

const estimateHelp = computed(() => {
  if (estimateMinutes.value === undefined) return undefined
  if (estimateMinutes.value == null) return 'Free text — “40h”, “2h 30m”, “90m”.'
  return `≈ ${formatEstimate(estimateMinutes.value)} estimated`
})

const canSubmit = computed(() =>
  !!name.value.trim() && rateNum.value !== undefined && estimateMinutes.value !== undefined
)

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  try {
    const payload: TaskPayload = {
      name: name.value.trim(),
      projectId: projectId.value,
      rate: rateNum.value as number | null,
      estimateMinutes: estimateMinutes.value as number | null,
      done: done.value
    }
    if (props.task) await catalog.updateTask(props.task.id, payload)
    else await catalog.createTask(payload)
    open.value = false
  } finally {
    busy.value = false
  }
}

// Delete: soft delete + undo toast restoring the DeleteResult snapshot
async function remove() {
  if (!props.task || busy.value) return
  busy.value = true
  const label = props.task.name
  try {
    const result = await catalog.removeTask(props.task.id)
    open.value = false
    toast.add({
      title: `Moved “${label}” to trash`,
      icon: 'i-lucide-trash-2',
      duration: ui.undoSeconds * 1000, // Rule 4: 3–30s, Settings → Profile
      actions: [{
        label: 'Undo',
        color: 'primary',
        variant: 'outline',
        onClick: async () => {
          // One batch id — a task's detached entries are as unbounded as any
          // cascade's, and the snapshot form caps out at 10k (Tick#11).
          await $fetch('/api/restore', { method: 'POST', body: { batchId: result.batchId } })
          await catalog.fetchAll()
          await useEntriesStore().refresh().catch(() => {})
        }
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
    :title="task ? 'Edit task' : 'New task'"
    :ui="{ content: 'max-w-[480px]' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Name">
          <UInput
            v-model="name"
            autofocus
            placeholder="e.g. Homepage hero"
            class="w-full"
            @keydown.enter="submit"
          />
        </UFormField>

        <UFormField label="Project">
          <USelectMenu
            v-model="projectId"
            :items="projectItems"
            value-key="value"
            placeholder="No project — standalone"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Rate" :help="inheritedRate ? `Empty inherits ${inheritedRate}` : undefined">
            <UInput
              v-model="rateRaw"
              inputmode="decimal"
              :placeholder="inheritedRate || 'Hourly rate'"
              class="w-full tnum"
            >
              <template #leading>
                <span class="text-sm text-muted">$</span>
              </template>
              <template #trailing>
                <span class="text-sm text-muted">/h</span>
              </template>
            </UInput>
          </UFormField>

          <UFormField label="Estimate" :error="estimateError" :help="estimateHelp">
            <UInput v-model="estimateRaw" placeholder="2h 30m" class="w-full tnum" />
          </UFormField>
        </div>

        <USwitch v-model="done" label="Completed" />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          v-if="task"
          color="error"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          label="Delete task"
          @click="remove"
        />
        <div class="ml-auto flex items-center gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
          <UButton
            color="primary"
            variant="outline"
            :label="task ? 'Save changes' : 'Create task'"
            :disabled="!canSubmit"
            :loading="busy"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
