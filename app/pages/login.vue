<script setup lang="ts">
import { z } from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import type { ThemeSettings } from '~/stores/theme'

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
    // Apply the account's saved theme (users.theme) so another device picks it
    // up on login; save() re-persists it locally (and writes the color-mode
    // cookie, so later SSR loads render the right mode on the first byte).
    try {
      const me = await $fetch<SessionUser & { theme: Record<string, unknown> | null }>('/api/me')
      if (me.theme) {
        const theme = useThemeStore()
        theme.load(me.theme as Partial<ThemeSettings>)
        theme.save()
      }
    } catch { /* theme apply is best-effort; login already succeeded */ }
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
        <template #title>
          <h1>Welcome back to Tick</h1>
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
          <div class="flex flex-col gap-1">
            <div>
              New to Tick?
              <NuxtLink to="/register" class="font-medium text-primary">
                Create your workspace
              </NuxtLink>
            </div>
            <NuxtLink to="/forgot-password" class="text-sm text-muted hover:text-primary">
              Forgot password?
            </NuxtLink>
          </div>
        </template>
      </UAuthForm>
  </UPageCard>
</template>
