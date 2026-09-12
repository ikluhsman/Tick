<script setup lang="ts">
// Reports page — range + billable controls, CSV / Print / Export PDF, stat
// cards, hours-by-day stacked chart, regroupable breakdown table.
// "Export PDF" downloads a real server-rendered PDF (GET /api/export/pdf);
// "Print" keeps the old path: window.print() over the @media print stylesheet
// below, which strips the shell down to a light, clean report.
import { CalendarDate, type DateValue } from '@internationalized/date'
import type { ReportBillFilter, ReportGroupBy } from '#shared/types/reports'

useHead({
  title: 'Reports · Tick',
  bodyAttrs: { class: 'tick-print-reports' }
})

const reports = useReportsStore()

// SSR-hydrated summary: fetch on the server (state rides the Pinia payload, so
// hydration re-fetches nothing) and again on every later client-side visit.
await useAsyncData('reports-summary', async () => {
  await reports.fetchSummary()
  return true
})

const ranges = [
  { key: 'week', label: 'This week' },
  { key: 'lastweek', label: 'Last week' },
  { key: 'month', label: 'This month' }
] as const

const billFilters: { key: ReportBillFilter, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'billable', label: 'Billable' },
  { key: 'nonbillable', label: 'Non-billable' }
]

const groupings: { key: ReportGroupBy, label: string }[] = [
  { key: 'client', label: 'Client' },
  { key: 'project', label: 'Project' },
  { key: 'task', label: 'Task' },
  { key: 'tag', label: 'Tag' }
]

const groupLabel = computed(
  () => groupings.find(g => g.key === reports.groupBy)?.label ?? 'Project'
)

// ── Custom range (popover + UCalendar range selection) ──────────────────────
const customOpen = ref(false)

const toCalendarDate = (iso: string | null): CalendarDate | null => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new CalendarDate(y!, m ?? 1, d ?? 1)
}

const calendarRange = shallowRef<{ start: DateValue | null, end: DateValue | null }>({
  start: toCalendarDate(reports.customFrom),
  end: toCalendarDate(reports.customTo)
})

function onCalendarRange(v: typeof calendarRange.value | null) {
  calendarRange.value = v ?? { start: null, end: null }
  const { start, end } = calendarRange.value
  if (start && end) {
    customOpen.value = false
    reports.setCustomRange(
      start.toString().slice(0, 10),
      end.toString().slice(0, 10)
    )
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────
function downloadCsv() {
  // Content-Disposition: attachment — the browser downloads without navigating.
  window.location.assign(reports.csvUrl)
}

function exportPdf() {
  // Content-Disposition: attachment — an anchor click downloads without
  // navigating and keeps the server-supplied filename.
  const a = document.createElement('a')
  a.href = reports.pdfUrl
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function printReport() {
  // Secondary path: the browser's own print dialog over the print styles.
  window.print()
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1100px] flex-col gap-[17px] px-[22px] pt-[22px] pb-[120px]">
    <!-- Header + controls -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-[200px] flex-1">
        <h1 class="text-[28px] font-medium text-highlighted">Reports</h1>
        <p class="tnum text-[13px] text-muted">{{ reports.rangeLabel }}</p>
      </div>
      <div class="print-hide flex flex-wrap items-center gap-2">
        <UFieldGroup>
          <UButton
            v-for="r in ranges"
            :key="r.key"
            :label="r.label"
            variant="outline"
            :color="reports.range === r.key ? 'primary' : 'neutral'"
            :class="reports.range === r.key ? '' : 'text-muted'"
            @click="reports.setRange(r.key)"
          />
          <UPopover v-model:open="customOpen">
            <UButton
              label="Custom"
              icon="i-lucide-calendar"
              variant="outline"
              :color="reports.range === 'custom' ? 'primary' : 'neutral'"
              :class="reports.range === 'custom' ? '' : 'text-muted'"
            />
            <template #content>
              <UCalendar
                range
                :model-value="(calendarRange as any)"
                class="p-2"
                @update:model-value="onCalendarRange($event as any)"
              />
            </template>
          </UPopover>
        </UFieldGroup>
        <UFieldGroup>
          <UButton
            v-for="b in billFilters"
            :key="b.key"
            :label="b.label"
            variant="outline"
            :color="reports.billable === b.key ? 'primary' : 'neutral'"
            :class="reports.billable === b.key ? '' : 'text-muted'"
            @click="reports.setBillable(b.key)"
          />
        </UFieldGroup>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          label="CSV"
          @click="downloadCsv"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-printer"
          label="Print"
          @click="printReport"
        />
        <UButton
          color="primary"
          variant="outline"
          icon="i-lucide-file-text"
          label="Export PDF"
          @click="exportPdf"
        />
      </div>
    </div>

    <template v-if="reports.summary">
      <ReportsStatCards :totals="reports.summary.totals" />

      <ReportsHoursChart
        :days="reports.summary.days"
        :groups="reports.summary.groups"
        :group-label="groupLabel"
      />

      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-3 px-1">
          <h3 class="text-[16px] font-medium text-highlighted">Breakdown</h3>
          <UFieldGroup class="print-hide ml-auto">
            <UButton
              v-for="g in groupings"
              :key="g.key"
              :label="g.label"
              variant="outline"
              :color="reports.groupBy === g.key ? 'primary' : 'neutral'"
              :class="reports.groupBy === g.key ? '' : 'text-muted'"
              @click="reports.setGroupBy(g.key)"
            />
          </UFieldGroup>
        </div>
        <ReportsBreakdownTable
          :groups="reports.summary.groups"
          :totals="reports.summary.totals"
          :group-label="groupLabel"
        />
      </div>
    </template>

    <!-- Loading / error -->
    <div
      v-else
      class="rounded-lg bg-elevated p-[22px] text-center text-[13px] text-muted shadow-sm"
    >
      {{ reports.error ? 'Couldn’t load this report — try again.' : 'Loading report…' }}
    </div>
  </div>
</template>

<!-- Print stylesheet ("Export PDF"). Unscoped on purpose, but every rule is
     gated behind .tick-print-reports — a body class this page adds via
     useHead and removes on leave — so nothing leaks to other pages.
     Colors remap Nuxt UI's semantic tokens to their light-mode ramp values
     (no raw hex) for a light, clean sheet of paper. -->
<style>
@media print {
  .tick-print-reports {
    --ui-bg: var(--color-white);
    --ui-bg-muted: var(--ui-color-neutral-50);
    --ui-bg-elevated: var(--color-white);
    --ui-bg-accented: var(--ui-color-neutral-200);
    --ui-text-dimmed: var(--ui-color-neutral-400);
    --ui-text-muted: var(--ui-color-neutral-500);
    --ui-text-toned: var(--ui-color-neutral-600);
    --ui-text: var(--ui-color-neutral-700);
    --ui-text-highlighted: var(--ui-color-neutral-900);
    --ui-border: var(--ui-color-neutral-200);
    --ui-border-muted: var(--ui-color-neutral-200);
    --ui-border-accented: var(--ui-color-neutral-300);
    --ui-primary: var(--ui-color-primary-600);
    background: var(--color-white) !important;
    color: var(--ui-color-neutral-900);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Shell: sidebar + sticky timer bar + interactive controls disappear */
  .tick-print-reports aside,
  .tick-print-reports main > div.sticky,
  .tick-print-reports .print-hide {
    display: none !important;
  }

  /* Cards flatten to hairline borders instead of dark-theme ring shadows */
  .tick-print-reports .shadow-sm {
    box-shadow: 0 0 0 1px var(--ui-color-neutral-300) !important;
  }

  .tick-print-reports main {
    display: block !important;
  }
}
</style>
