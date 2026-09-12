<script setup lang="ts">
// Settings: tabbed area — Appearance (theme editor, default), Profile,
// Organization, Members & roles, Trash, Import. The Reset / "Copy
// app.config.ts" header buttons only make sense on Appearance.
import type { TabsItem } from '@nuxt/ui'

useHead({ title: 'Settings · Tick' })

const theme = useThemeStore()
const toast = useToast()

const tabs: TabsItem[] = [
  { label: 'Appearance', value: 'appearance' },
  { label: 'Profile', value: 'profile' },
  { label: 'Organization', value: 'organization' },
  { label: 'Members & roles', value: 'members' },
  { label: 'Trash', value: 'trash' },
  { label: 'Import', value: 'import' }
]

const tab = ref('appearance')

const sublines: Record<string, string> = {
  appearance: 'Appearance applies live to the whole app and is saved per user.',
  profile: 'Your account: name, email, default rate and password.',
  organization: 'Workspace name and membership at a glance.',
  members: 'Who has access, their roles and rate overrides.',
  trash: 'Deleted items stay restorable for 30 days.',
  import: 'Bring entries in from Toggl, Clockify or a CSV.'
}

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
        <p class="text-[13px] text-muted">{{ sublines[tab] }}</p>
      </div>
      <div v-if="tab === 'appearance'" class="flex gap-2">
        <UButton color="neutral" variant="outline" @click="resetTheme">
          Reset
        </UButton>
        <UButton color="primary" variant="outline" icon="i-lucide-clipboard-copy" @click="copyConfig">
          Copy app.config.ts
        </UButton>
      </div>
    </div>

    <!-- Tabs -->
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
    <SettingsProfileTab v-else-if="tab === 'profile'" />
    <SettingsOrganizationTab v-else-if="tab === 'organization'" />
    <SettingsMembersTab v-else-if="tab === 'members'" />
    <SettingsTrashTab v-else-if="tab === 'trash'" />
    <SettingsImportTab v-else-if="tab === 'import'" />
  </div>
</template>
