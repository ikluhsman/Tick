<script setup lang="ts">
// Client form (README "Clients"): name + optional rate. Rates set here are
// inherited by projects without their own rate (Rule 2).

import type { ClientPayload } from '~/stores/catalog'

const props = defineProps<{ client?: ClientDto | null }>()
const open = defineModel<boolean>('open', { default: false })

const catalog = useCatalogStore()
const session = useUserSession()

const name = ref('')
const rateRaw = ref('')
const busy = ref(false)

watch(open, (v) => {
  if (!v) return
  name.value = props.client?.name ?? ''
  rateRaw.value = props.client?.rate != null ? String(props.client.rate) : ''
})

const userRate = computed(() => (session.user.value as SessionUser | null)?.defaultRate ?? null)

/** null = empty, undefined = invalid */
const rateNum = computed<number | null | undefined>(() => {
  const t = rateRaw.value.trim().replace(/^\$/, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
})

const canSubmit = computed(() => !!name.value.trim() && rateNum.value !== undefined)

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  try {
    const payload: ClientPayload = {
      name: name.value.trim(),
      rate: rateNum.value as number | null
    }
    if (props.client) await catalog.updateClient(props.client.id, payload)
    else await catalog.createClient(payload)
    open.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="client ? 'Edit client' : 'New client'"
    :ui="{ content: 'max-w-[440px]' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Name">
          <UInput
            v-model="name"
            autofocus
            placeholder="e.g. Acme Co"
            class="w-full"
            @keydown.enter="submit"
          />
        </UFormField>

        <UFormField
          label="Rate"
          :help="userRate != null ? `Empty inherits your $${userRate}/h default.` : 'Optional — inherited by projects without their own rate.'"
        >
          <UInput
            v-model="rateRaw"
            inputmode="decimal"
            :placeholder="userRate != null ? `$${userRate}/h default` : 'Hourly rate'"
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
      </div>
    </template>

    <template #footer>
      <div class="ml-auto flex items-center gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
        <UButton
          color="primary"
          variant="outline"
          :label="client ? 'Save changes' : 'Create client'"
          :disabled="!canSubmit"
          :loading="busy"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
