<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const message = computed(() => {
  if (props.error.statusCode === 404) return 'This page doesn’t exist.'
  return props.error.statusMessage || 'Something went wrong.'
})
</script>

<template>
  <UApp>
    <div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-default p-6 text-default">
      <ShellTickLogo :size="48" />
      <h1 class="tnum text-[28px] font-medium text-highlighted">{{ error.statusCode }}</h1>
      <p class="text-sm text-muted">{{ message }}</p>
      <UButton color="primary" variant="outline" @click="clearError({ redirect: '/' })">
        Back to Tick
      </UButton>
    </div>
  </UApp>
</template>
