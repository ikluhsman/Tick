<script setup lang="ts">
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import type { InviteLookupDto } from '#shared/types/settings'

definePageMeta({ layout: 'auth' })

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters')
})
type Schema = z.output<typeof schema>

// ── Invite (?invite=TOKEN): prefill the email and join that org on submit ──
const route = useRoute()
const inviteToken = typeof route.query.invite === 'string' ? route.query.invite : null

const { data: invite, error: inviteError } = await useAsyncData<InviteLookupDto | null>(
  'invite-lookup',
  () => (inviteToken ? $fetch(`/api/invites/lookup/${inviteToken}`) : Promise.resolve(null))
)

// NUXT_PUBLIC_REGISTRATION: 'open' (default) | 'invite' | 'closed'.
const registrationMode
  = (useRuntimeConfig().public.registration || 'open') as 'open' | 'invite' | 'closed'
const canRegister = computed(() =>
  registrationMode === 'open' || (registrationMode === 'invite' && !!invite.value)
)
const closedMessage = computed(() => {
  if (registrationMode === 'closed') return 'Self-serve registration is disabled on this server. Contact your administrator for an account.'
  if (registrationMode === 'invite' && !canRegister.value) return 'Registration is invite-only on this server. Ask an admin for an invite link, or use one you already have.'
  return null
})

const inviteProblem = computed(() => {
  if (!inviteToken || !inviteError.value) return null
  const status = (inviteError.value as { statusCode?: number }).statusCode
  const fallback = registrationMode === 'open'
    ? ' You can still create your own workspace below.'
    : ''
  return status === 410
    ? `This invite has expired or was already used.${fallback}`
    : `That invite link is invalid.${fallback}`
})

useHead({
  title: computed(() =>
    invite.value ? `Join ${invite.value.orgName} · Tick` : 'Create your workspace · Tick'
  )
})

const fields = computed<AuthFormField[]>(() => [
  {
    name: 'name',
    type: 'text',
    label: 'Name',
    placeholder: 'Your name',
    required: true
  },
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'you@example.com',
    defaultValue: invite.value?.email,
    required: true
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'At least 8 characters',
    required: true
  }
])

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const { fetch: refreshSession } = useUserSession()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: invite.value && inviteToken ? { ...event.data, inviteToken } : event.data
    })
    await refreshSession()
    await navigateTo('/')
  } catch (err) {
    const e = err as { data?: { message?: string } }
    errorMessage.value = e.data?.message ?? 'Something went wrong. Try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard class="w-full">
      <div v-if="!canRegister" class="flex flex-col gap-4">
        <h1 class="text-xl font-medium">
          Registration unavailable
        </h1>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-user-lock"
          :title="closedMessage ?? undefined"
        />
        <UAlert
          v-if="inviteProblem"
          color="warning"
          variant="subtle"
          icon="i-lucide-mail-x"
          :title="inviteProblem"
        />
        <p class="text-sm text-muted">
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-primary">
            Sign in
          </NuxtLink>
        </p>
      </div>
      <UAuthForm
        v-else
        :schema="schema"
        :fields="fields"
        :loading="loading"
        :title="invite ? `Join ${invite.orgName}` : 'Create your workspace'"
        :description="
          invite
            ? `You've been invited to ${invite.orgName} as ${invite.role}. Create your account to join.`
            : 'Track time for yourself and your clients in minutes.'
        "
        :submit="{
          label: invite ? `Join ${invite.orgName}` : 'Create workspace',
          color: 'primary',
          variant: 'outline',
          block: true
        }"
        :ui="{ title: 'font-medium' }"
        @submit="onSubmit"
      >
        <template #title>
          <h1>{{ invite ? `Join ${invite.orgName}` : 'Create your workspace' }}</h1>
        </template>
        <template #validation>
          <UAlert
            v-if="inviteProblem && !errorMessage"
            color="warning"
            variant="subtle"
            icon="i-lucide-mail-x"
            :title="inviteProblem"
          />
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="errorMessage"
          />
        </template>
        <template #footer>
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-primary">
            Sign in
          </NuxtLink>
        </template>
      </UAuthForm>
  </UPageCard>
</template>
