<script setup lang="ts">
// Breakdown table — one row per group (buckets like "No client"/"Untagged"
// are real rows): color chip + label + sub(parent) · share bar + % ·
// Entries · Hours · Billable · Amount, then a Total row. Chip colors are
// the same ranked series tokens the chart uses.
import type { ReportGroup, ReportTotals } from '#shared/types/reports'

const props = defineProps<{
  groups: ReportGroup[]
  totals: ReportTotals
  groupLabel: string
}>()

const rows = computed(() =>
  props.groups.map(g => ({
    key: g.key,
    label: g.label,
    sub: g.sub,
    color: reportSeriesColor(g.color),
    sharePct: g.sharePct,
    entries: g.entries,
    hours: dashDuration(g.sec),
    billable: g.billableSec ? dashDuration(g.billableSec) : '—',
    amount: g.amount ? dashMoney(g.amount) : '—'
  }))
)
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-elevated shadow-sm">
    <!-- Header -->
    <div class="report-grid border-b border-default px-5 py-2 text-[10px] uppercase tracking-[.08em] text-muted">
      <span>{{ groupLabel }}</span>
      <span>Share</span>
      <span class="text-right">Entries</span>
      <span class="text-right">Hours</span>
      <span class="text-right">Billable</span>
      <span class="text-right">Amount</span>
    </div>

    <!-- Rows -->
    <div
      v-for="r in rows"
      :key="r.key"
      class="report-grid items-center border-b border-default/40 px-5 py-2.5 text-[13px] hover:bg-default/40"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span class="size-2 flex-none rounded-[2px]" :style="{ background: r.color }" />
        <span class="truncate text-default">{{ r.label }}</span>
        <span v-if="r.sub" class="truncate text-[11px] text-muted">{{ r.sub }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-1.5 flex-1 overflow-hidden rounded-full" style="background: var(--ui-bg)">
          <span
            class="block h-full rounded-full"
            :style="{ width: r.sharePct + '%', background: r.color }"
          />
        </div>
        <span class="tnum w-8 text-right text-[11px] text-muted">{{ r.sharePct }}%</span>
      </div>
      <span class="tnum text-right text-muted">{{ r.entries }}</span>
      <span class="tnum text-right font-medium text-highlighted">{{ r.hours }}</span>
      <span class="tnum text-right text-primary">{{ r.billable }}</span>
      <span class="tnum text-right text-default">{{ r.amount }}</span>
    </div>

    <!-- Empty -->
    <div v-if="!rows.length" class="px-5 py-6 text-center text-[13px] text-muted">
      No entries in this range.
    </div>

    <!-- Total -->
    <div v-else class="report-grid px-5 py-2.5 text-[13px] font-medium">
      <span class="text-highlighted">Total</span>
      <span />
      <span class="tnum text-right text-muted">{{ totals.entries }}</span>
      <span class="tnum text-right text-highlighted">{{ dashDuration(totals.sec) }}</span>
      <span class="tnum text-right text-primary">{{ totals.billableSec ? dashDuration(totals.billableSec) : '—' }}</span>
      <span class="tnum text-right text-highlighted">{{ totals.amount ? dashMoney(totals.amount) : '—' }}</span>
    </div>
  </div>
</template>

<style scoped>
.report-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) 70px 90px 90px 90px;
  gap: 16px;
}
</style>
