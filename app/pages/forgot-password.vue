<script setup lang="ts">
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Forgot password · Tick' })

const schema = z.object({
  email: z.string().min(1, 'Email is required')
})
type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'you@example.com',
    required: true
  }
]

const loading = ref(false)
const submitted = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/forgot', { method: 'POST', body: event.data })
    submitted.value = true
  } catch {
    errorMessage.value = 'Something went wrong. Try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard class="w-full">
    <!-- Generic success state — same regardless of whether the account exists -->
    <div v-if="submitted" class="flex flex-col items-center gap-3 py-2 text-center">
      <UIcon name="i-lucide-mail-check" class="size-8 text-primary" />
      <h1 class="text-lg font-medium text-highlighted">Check your email</h1>
      <p class="text-sm text-muted">
        If an account exists for that address, a reset link is on its way.
        It expires in 1 hour. On instances without email configured, the link
        appears in the server logs instead.
      </p>
      <NuxtLink to="/login" class="text-sm font-medium text-primary">
        Back to sign in
      </NuxtLink>
    </div>

    <UAuthForm
      v-else
      :schema="schema"
      :fields="fields"
      :loading="loading"
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
      :submit="{ label: 'Send reset link', color: 'primary', variant: 'outline', block: true }"
      :ui="{ title: 'font-medium' }"
      @submit="onSubmit"
    >
      <template #title>
        <h1>Forgot your password?</h1>
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
        Remembered it?
        <NuxtLink to="/login" class="font-medium text-primary">
          Back to sign in
        </NuxtLink>
      </template>
    </UAuthForm>
  </UPageCard>
</template>
