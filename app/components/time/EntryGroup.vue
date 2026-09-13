<script setup lang="ts">
// One group on the Time page: heading row (label · date · total) above a
// surface card of entry rows. Works for both By-day and By-project grouping.
import type { EntryDto } from '#shared/types'

defineProps<{
  label: string
  sub: string
  totalSec: number
  entries: EntryDto[]
}>()

const emit = defineEmits<{ delete: [entry: EntryDto] }>()
</script>

<template>
  <section class="flex flex-col gap-2">
    <div class="flex items-baseline gap-2.5 px-1.5">
      <h2 class="text-base font-medium text-highlighted">{{ label }}</h2>
      <span v-if="sub" class="text-xs text-muted">{{ sub }}</span>
      <span class="tnum ml-auto text-sm font-medium text-toned">{{ formatDuration(totalSec) }}</span>
    </div>
    <div class="overflow-hidden rounded-lg bg-elevated shadow-sm ring ring-default">
      <TimeEntryRow
        v-for="(e, i) in entries"
        :key="e.id"
        :entry="e"
        :first="i === 0"
        @delete="emit('delete', e)"
      />
    </div>
  </section>
</template>
