<script setup lang="ts">
// Project form (README "Projects & tasks" forms): name, client picker (searchable),
// billable default, rate, free-text estimate (parseEstimate from app/utils/parse.ts),
// visibility. Edit mode adds Delete → cascade dialog (Rule 3).

import type { ProjectPayload } from '~/stores/catalog'

const props = defineProps<{ project?: ProjectDto | null }>()
const open = defineModel<boolean>('open', { default: false })

const catalog = useCatalogStore()
const ui = useUiStore()
const session = useUserSession()

const name = ref('')
const clientId = ref<string | null>(null)
const billableDefault = ref(true)
const rateRaw = ref('')
const estimateRaw = ref('')
const visibility = ref<'private' | 'public'>('private')
const busy = ref(false)

watch(open, (v) => {
  if (!v) return
  const p = props.project
  name.value = p?.name ?? ''
  clientId.value = p?.clientId ?? null
  billableDefault.value = p?.billableDefault ?? true
  rateRaw.value = p?.rate != null ? String(p.rate) : ''
  estimateRaw.value = p?.estimateMinutes ? formatEstimate(p.estimateMinutes) : ''
  visibility.value = p?.visibility ?? 'private'
})

const clientItems = computed(() => [
  { label: 'No client', value: null as string | null },
  ...catalog.clients.map(c => ({ label: c.name, value: c.id as string | null }))
])

// Rate — optional; placeholder shows what would be inherited (Rule 2)
const userRate = computed(() => (session.user.value as SessionUser | null)?.defaultRate ?? null)

const inheritedRate = computed(() => {
  const client = clientId.value ? catalog.clients.find(c => c.id === clientId.value) : null
  if (client?.rate != null) return `$${client.rate}/h from client`
  return userRate.value != null ? `$${userRate.value}/h default` : ''
})

/** null = empty, undefined = invalid */
const rateNum = computed<number | null | undefined>(() => {
  const t = rateRaw.value.trim().replace(/^\$/, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
})

// Estimate — free text via parseEstimate ("40h", "2h 30m", "90m") → minutes
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
    const payload: ProjectPayload = {
      name: name.value.trim(),
      clientId: clientId.value,
      billableDefault: billableDefault.value,
      rate: rateNum.value as number | null,
      estimateMinutes: estimateMinutes.value as number | null,
      visibility: visibility.value
    }
    if (props.project) await catalog.updateProject(props.project.id, payload)
    else await catalog.createProject(payload)
    open.value = false
  } finally {
    busy.value = false
  }
}

// Delete → cascade dialog (Rule 3); the dialog handles counts, flags and undo.
function askDelete() {
  if (!props.project) return
  const id = props.project.id
  open.value = false
  ui.openCascade('project', id)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="project ? 'Edit project' : 'New project'"
    :ui="{ content: 'max-w-[520px]' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Name">
          <UInput
            v-model="name"
            autofocus
            placeholder="e.g. Website redesign"
            class="w-full"
            @keydown.enter="submit"
          />
        </UFormField>

        <UFormField label="Client" help="Cleared projects fall back to your default rate.">
          <USelectMenu
            v-model="clientId"
            :items="clientItems"
            value-key="value"
            placeholder="No client"
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
            <UInput v-model="estimateRaw" placeholder="40h, 2h 30m…" class="w-full tnum" />
          </UFormField>
        </div>

        <div class="flex items-center justify-between gap-4">
          <USwitch v-model="billableDefault" label="Billable by default" />
          <URadioGroup
            v-model="visibility"
            orientation="horizontal"
            :items="[
              { label: 'Private', value: 'private' },
              { label: 'Public', value: 'public' }
            ]"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          v-if="project"
          color="error"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          label="Delete project…"
          @click="askDelete"
        />
        <div class="ml-auto flex items-center gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
          <UButton
            color="primary"
            variant="outline"
            :label="project ? 'Save changes' : 'Create project'"
            :disabled="!canSubmit"
            :loading="busy"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
