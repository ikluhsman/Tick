<script setup lang="ts">
// Reports stat cards: Tracked / Billable / Amount / Per day.
// Values come straight from ReportTotals — the server owns all aggregation.
import type { ReportTotals } from '#shared/types/reports'

const props = defineProps<{ totals: ReportTotals }>()

const stats = computed(() => {
  const t = props.totals
  return [
    {
      label: 'Tracked',
      value: dashDuration(t.sec),
      meta: `${t.workedDays} working day${t.workedDays === 1 ? '' : 's'}`
    },
    {
      label: 'Billable',
      value: dashDuration(t.billableSec),
      meta: t.sec ? `${Math.round((t.billableSec / t.sec) * 100)}% of tracked` : '—'
    },
    {
      label: 'Amount',
      value: dashMoney(t.amount),
      meta: t.avgRate != null ? `avg $${Math.round(t.avgRate)}/h` : 'nothing billable'
    },
    {
      label: 'Per day',
      value: t.workedDays ? dashDuration(t.sec / t.workedDays) : '—',
      meta: 'average on worked days'
    }
  ]
})
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
    <UCard
      v-for="s in stats"
      :key="s.label"
      class="bg-elevated shadow-sm"
      :ui="{ body: 'flex flex-col gap-0.75 p-4 px-5 sm:p-4 sm:px-5' }"
    >
      <div class="text-[10px] font-medium uppercase tracking-widest text-primary">{{ s.label }}</div>
      <div class="tnum text-[24px] font-medium leading-[1.1] text-highlighted">{{ s.value }}</div>
      <div class="text-[11px] text-dimmed">{{ s.meta }}</div>
    </UCard>
  </div>
</template>
