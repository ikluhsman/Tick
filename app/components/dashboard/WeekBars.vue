<script setup lang="ts">
// This-week bars: Mon–Sun rows, 8px pill bars split into billable (accent) and
// non-billable (neutral) segments, hours right-aligned. GSAP grows the
// segments in from scaleX 0 on mount.
import { gsap } from 'gsap'

const props = defineProps<{ summary: DashboardSummary }>()

type WeekDay = DashboardSummary['weekDays'][number]

/** Bars scale against the busiest day, floored at 8h so light weeks stay calm. */
const denomSec = computed(() =>
  Math.max(
    8 * 3600,
    ...props.summary.weekDays.map(d => d.billableSec + d.nonBillableSec)
  )
)

function rowFor(d: WeekDay) {
  const totalSec = d.billableSec + d.nonBillableSec
  return {
    date: d.date,
    label: dashParseDay(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
    isToday: dashIsToday(d.date),
    billPct: (d.billableSec / denomSec.value) * 100,
    nonPct: (d.nonBillableSec / denomSec.value) * 100,
    billTitle: `${dashDuration(d.billableSec)} billable`,
    nonTitle: `${dashDuration(d.nonBillableSec)} not billable`,
    hours: totalSec > 0 ? (totalSec / 3600).toFixed(1) + 'h' : '–'
  }
}

const rows = computed(() => props.summary.weekDays.map(rowFor))

/** "Mon 8 – Sun 14 Sep" (month on both ends when they differ). */
const rangeLabel = computed(() => {
  const days = props.summary.weekDays
  if (!days.length) return ''
  const a = dashParseDay(days[0]!.date)
  const b = dashParseDay(days[days.length - 1]!.date)
  const wd = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
  const mo = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  const start = a.getMonth() === b.getMonth()
    ? `${wd(a)} ${a.getDate()}`
    : `${wd(a)} ${a.getDate()} ${mo(a)}`
  return `${start} – ${wd(b)} ${b.getDate()} ${mo(b)}`
})

const barsEl = ref<HTMLElement | null>(null)

onMounted(() => {
  if (dashReducedMotion() || !barsEl.value) return
  const segs = barsEl.value.querySelectorAll('[data-seg]')
  if (segs.length) {
    gsap.from(segs, {
      scaleX: 0,
      transformOrigin: '0% 50%',
      duration: 0.4,
      ease: 'power2.out',
      stagger: 0.03
    })
  }
})
</script>

<template>
  <UCard class="bg-elevated shadow-sm" :ui="{ body: 'p-4 sm:p-4' }">
    <div class="flex items-baseline gap-2.5">
      <h2 class="text-[15px] font-medium text-highlighted">This week</h2>
      <span class="text-[11px] text-dimmed">{{ rangeLabel }}</span>
    </div>
    <div ref="barsEl" class="mt-1.5 flex flex-col gap-1.75">
      <div
        v-for="r in rows"
        :key="r.date"
        class="grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-3 text-xs"
      >
        <span :class="r.isToday ? 'text-primary' : 'text-muted'">{{ r.label }}</span>
        <div
          class="flex h-2 gap-0.5 overflow-hidden rounded-full"
          style="background: var(--ui-bg)"
        >
          <span
            v-if="r.billPct > 0"
            data-seg
            :title="r.billTitle"
            class="h-full rounded-full"
            :style="{ width: r.billPct + '%', background: 'var(--ui-primary)' }"
          />
          <span
            v-if="r.nonPct > 0"
            data-seg
            :title="r.nonTitle"
            class="h-full rounded-full"
            :style="{ width: r.nonPct + '%', background: 'var(--ui-border-accented)' }"
          />
        </div>
        <span
          class="tnum text-right font-medium"
          :class="r.hours === '–' ? 'text-dimmed' : 'text-highlighted'"
        >{{ r.hours }}</span>
      </div>
    </div>
  </UCard>
</template>
