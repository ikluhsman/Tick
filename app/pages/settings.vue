<script setup lang="ts">
// Settings: tabbed area — only Appearance is built (theme editor);
// Profile / Organization / Members & roles / Trash / Import are disabled
// placeholders for a later swing. Header: Reset + "Copy app.config.ts".
import type { TabsItem } from '@nuxt/ui'

const theme = useThemeStore()
const toast = useToast()

const tabs: TabsItem[] = [
  { label: 'Appearance', value: 'appearance' },
  { label: 'Profile', value: 'profile', disabled: true },
  { label: 'Organization', value: 'organization', disabled: true },
  { label: 'Members & roles', value: 'members', disabled: true },
  { label: 'Trash', value: 'trash', disabled: true },
  { label: 'Import', value: 'import', disabled: true }
]

const tab = ref('appearance')

async function copyConfig() {
  try {
    await navigator.clipboard.writeText(theme.configText)
    toast.add({
      title: 'Copied app.config.ts',
      description: 'Current colors, radius and font are on your clipboard.',
      icon: 'i-lucide-clipboard-check',
      color: 'primary'
    })
  } catch {
    toast.add({
      title: "Couldn't copy to clipboard",
      icon: 'i-lucide-clipboard-x',
      color: 'error'
    })
  }
}

function resetTheme() {
  theme.reset()
  toast.add({
    title: 'Theme reset to Nocturne',
    icon: 'i-lucide-rotate-ccw',
    color: 'neutral'
  })
}
</script>

<template>
  <div class="flex w-full max-w-[1100px] flex-col gap-[22px] px-[22px] pt-[22px] pb-[120px]">
    <!-- Header -->
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-[200px] flex-1">
        <h1 class="text-[28px] font-medium leading-tight text-highlighted">Settings</h1>
        <p class="text-[13px] text-muted">Appearance applies live to the whole app and is saved per user.</p>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="resetTheme">
          Reset
        </UButton>
        <UButton color="primary" variant="outline" icon="i-lucide-clipboard-copy" @click="copyConfig">
          Copy app.config.ts
        </UButton>
      </div>
    </div>

    <!-- Tabs (only Appearance is built) -->
    <UTabs
      v-model="tab"
      :items="tabs"
      variant="link"
      color="primary"
      size="sm"
      :content="false"
      class="w-full"
    />

    <SettingsAppearanceEditor v-if="tab === 'appearance'" />
  </div>
</template>
