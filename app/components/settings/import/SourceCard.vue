<script setup lang="ts">
// One import-source card: icon + name + short "export it like this" hint.
// Active card gets a primary border (accent stays in lines, never a fill).
defineProps<{
  title: string
  icon: string
  hint: string
  active: boolean
}>()

defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 text-left transition-colors hover:bg-elevated/50"
    :class="active ? 'border-primary ring-1 ring-primary' : 'border-default'"
    :aria-pressed="active"
    @click="$emit('select')"
  >
    <span class="flex items-center gap-2">
      <UIcon :name="icon" class="size-[18px]" :class="active ? 'text-primary' : 'text-dimmed'" />
      <span class="text-[13px] font-medium text-highlighted">{{ title }}</span>
    </span>
    <span class="text-[11px] leading-snug text-muted">{{ hint }}</span>
  </button>
</template>
