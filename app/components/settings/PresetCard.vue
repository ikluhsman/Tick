<script setup lang="ts">
// One preset card: paints itself in the preset's own colors (accent dot,
// surface dot, radius sample, name in its own face) regardless of the
// current app theme. Active card gets an accent border + 1px ring.
import { presetChrome, type ThemePreset } from '~/composables/useThemePresets'

const props = defineProps<{
  preset: ThemePreset
  active: boolean
}>()

defineEmits<{ apply: [] }>()

const chrome = computed(() => presetChrome(props.preset))
</script>

<template>
  <button
    type="button"
    class="flex cursor-pointer flex-col gap-2 rounded-md border p-2.5 text-left transition-shadow"
    :style="{
      background: chrome.bg,
      color: chrome.text,
      borderColor: active ? chrome.accent : chrome.border,
      boxShadow: active ? `0 0 0 1px ${chrome.accent}` : 'none'
    }"
    :aria-pressed="active"
    :aria-label="`Apply ${preset.name} preset`"
    @click="$emit('apply')"
  >
    <span class="flex items-center gap-1">
      <!-- accent dot -->
      <span class="size-[18px] rounded-full" :style="{ background: chrome.accent }" />
      <!-- surface dot -->
      <span
        class="size-[18px] rounded-full border"
        :style="{ background: chrome.surface, borderColor: chrome.border }"
      />
      <span class="flex-1" />
      <!-- radius sample -->
      <span
        class="h-[18px] w-[26px] border"
        :style="{ borderColor: chrome.accent, borderRadius: `${chrome.sampleRadius}px` }"
      />
    </span>
    <span class="text-[13px] font-medium leading-none" :style="{ fontFamily: chrome.fontFamily }">
      {{ preset.name }}
    </span>
    <span class="text-[11px] leading-none opacity-60">{{ preset.sub }}</span>
  </button>
</template>
