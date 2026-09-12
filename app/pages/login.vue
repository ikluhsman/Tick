<script setup lang="ts">
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Sign in · Tick' })

const schema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required')
})
type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'you@example.com',
    required: true
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Your password',
    required: true
  }
]

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const { fetch: refreshSession } = useUserSession()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
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
      <UAuthForm
        :schema="schema"
        :fields="fields"
        :loading="loading"
        title="Welcome back to Tick"
        description="Sign in to keep your hours ticking."
        :submit="{ label: 'Sign in', color: 'primary', variant: 'outline', block: true }"
        :ui="{ title: 'font-medium' }"
        @submit="onSubmit"
      >
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
          New to Tick?
          <NuxtLink to="/register" class="font-medium text-primary">
            Create your workspace
          </NuxtLink>
        </template>
      </UAuthForm>
  </UPageCard>
</template>
