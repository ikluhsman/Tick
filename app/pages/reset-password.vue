<script setup lang="ts">
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Reset password · Tick' })

const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string().min(1, 'Confirm your new password')
  })
  .refine(d => d.password === d.confirm, {
    message: 'Passwords don\'t match',
    path: ['confirm']
  })
type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'password',
    type: 'password',
    label: 'New password',
    placeholder: 'At least 8 characters',
    required: true
  },
  {
    name: 'confirm',
    type: 'password',
    label: 'Confirm password',
    placeholder: 'Repeat your new password',
    required: true
  }
]

const loading = ref(false)
const done = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/reset', {
      method: 'POST',
      body: { token: token.value, password: event.data.password }
    })
    done.value = true
  } catch (err) {
    const e = err as { statusCode?: number, data?: { message?: string } }
    errorMessage.value = e.data?.message ?? 'Something went wrong. Try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard class="w-full">
    <!-- Missing token: the page was opened without a reset link -->
    <div v-if="!token" class="flex flex-col items-center gap-3 py-2 text-center">
      <UIcon name="i-lucide-link-2-off" class="size-8 text-muted" />
      <h1 class="text-lg font-medium text-highlighted">Missing reset link</h1>
      <p class="text-sm text-muted">
        Open this page from the link in your reset email, or request a new one.
      </p>
      <NuxtLink to="/forgot-password" class="text-sm font-medium text-primary">
        Request a reset link
      </NuxtLink>
    </div>

    <div v-else-if="done" class="flex flex-col items-center gap-3 py-2 text-center">
      <UIcon name="i-lucide-check-circle-2" class="size-8 text-primary" />
      <h1 class="text-lg font-medium text-highlighted">Password updated</h1>
      <p class="text-sm text-muted">Your new password is set. Sign in to get back to work.</p>
      <UButton to="/login" color="primary" variant="outline" label="Sign in" />
    </div>

    <UAuthForm
      v-else
      :schema="schema"
      :fields="fields"
      :loading="loading"
      title="Choose a new password"
      description="Reset links work once and expire after 1 hour."
      :submit="{ label: 'Set new password', color: 'primary', variant: 'outline', block: true }"
      :ui="{ title: 'font-medium' }"
      @submit="onSubmit"
    >
      <template #title>
        <h1>Choose a new password</h1>
      </template>
      <template #validation>
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
        />
      </template>
      <template #footer>
        Link expired?
        <NuxtLink to="/forgot-password" class="font-medium text-primary">
          Request a new one
        </NuxtLink>
      </template>
    </UAuthForm>
  </UPageCard>
</template>
