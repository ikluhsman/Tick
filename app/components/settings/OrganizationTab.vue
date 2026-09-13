<script setup lang="ts">
// Settings → Organization: rename the org (owner/admin only — role from the
// session) and a member-count summary. PATCH /api/org keeps the sidebar's
// org name in step via the refreshed session.
import type { OrgInfoDto } from '#shared/types/settings'

const session = useUserSession()
const toast = useToast()

const me = computed(() => session.user.value as SessionUser | null)
const canManage = computed(() => me.value?.role === 'owner' || me.value?.role === 'admin')

const org = ref<OrgInfoDto | null>(null)
const name = ref('')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    org.value = await $fetch<OrgInfoDto>('/api/org')
    name.value = org.value.name
  } catch (err) {
    errorMessage.value = apiError(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const dirty = computed(() => org.value != null && name.value.trim() !== org.value.name)
const canSave = computed(() => canManage.value && dirty.value && name.value.trim().length > 0)

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  errorMessage.value = null
  try {
    org.value = await $fetch<OrgInfoDto>('/api/org', {
      method: 'PATCH',
      body: { name: name.value.trim() }
    })
    name.value = org.value.name
    await session.fetch()
    toast.add({ title: 'Organization renamed', icon: 'i-lucide-check', color: 'primary' })
  } catch (err) {
    errorMessage.value = apiError(err)
  } finally {
    saving.value = false
  }
}

function apiError(err: unknown): string {
  const e = err as { data?: { message?: string } }
  return e.data?.message ?? 'Something went wrong. Try again.'
}

const createdLabel = computed(() =>
  org.value
    ? new Date(org.value.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : ''
)
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-2">
    <!-- Rename card -->
    <section class="flex flex-col gap-4 rounded-lg border border-default bg-elevated p-[22px] shadow-sm">
      <div>
        <h2 class="text-[15px] font-medium text-highlighted">Organization</h2>
        <p class="text-xs text-muted">The workspace name shown in the sidebar and on invites.</p>
      </div>

      <UFormField
        label="Name"
        :help="canManage ? undefined : 'Only owners and admins can rename the organization.'"
      >
        <UInput
          v-model="name"
          :disabled="!canManage || loading"
          placeholder="Organization name"
          class="w-full"
          @keydown.enter="save"
        />
      </UFormField>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />

      <div v-if="canManage" class="flex justify-end">
        <UButton
          color="primary"
          variant="outline"
          label="Rename"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        />
      </div>
    </section>

    <!-- Summary card -->
    <section class="flex flex-col gap-4 rounded-lg border border-default bg-elevated p-[22px] shadow-sm">
      <div>
        <h2 class="text-[15px] font-medium text-highlighted">At a glance</h2>
        <p class="text-xs text-muted">Membership is managed under Members &amp; roles.</p>
      </div>

      <div v-if="org" class="flex flex-col gap-2 text-[13px]">
        <div class="flex items-center justify-between border-b border-default pb-2">
          <span class="text-muted">Members</span>
          <span class="tnum font-medium text-highlighted">{{ org.memberCount }}</span>
        </div>
        <div class="flex items-center justify-between border-b border-default pb-2">
          <span class="text-muted">Your role</span>
          <span class="capitalize text-highlighted">{{ me?.role }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-muted">Created</span>
          <span class="tnum text-highlighted">{{ createdLabel }}</span>
        </div>
      </div>
      <p v-else-if="loading" class="text-[13px] text-muted">Loading…</p>
    </section>
  </div>
</template>
