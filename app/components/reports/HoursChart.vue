<script setup lang="ts">
// Hours-by-day stacked column chart — bespoke SVG, no chart library.
// One column per day of the range (weekday labels ≤ 7 days, day numbers
// otherwise), segments colored by the current grouping's series token
// (same palette the breakdown table chips use), total hours above each
// column, legend top-right (top 5 groups). GSAP grows the columns in from
// the baseline; skipped when the user prefers reduced motion.
import { gsap } from 'gsap'
import type { ReportDay, ReportGroup } from '#shared/types/reports'

const props = defineProps<{
  days: ReportDay[]
  groups: ReportGroup[]
  groupLabel: string
}>()

const CHART_H = 180
const TOP = 16 // total-hours row
const BOTTOM = 22 // day-label row
const SEG_GAP = 2
const MIN_SEG = 3

const legend = computed(() =>
  props.groups.slice(0, 5).map(g => ({
    key: g.key,
    label: g.label,
    color: reportSeriesColor(g.color)
  }))
)

const colorByKey = computed(() => {
  const m = new Map<string, string>()
  for (const g of props.groups) m.set(g.key, reportSeriesColor(g.color))
  return m
})

const maxDaySec = computed(() => Math.max(1, ...props.days.map(d => d.totalSec)))

interface Seg {
  key: string
  y: number
  h: number
  color: string
  title: string
}

const columns = computed(() => {
  const n = props.days.length || 1
  const cell = 100 / n
  return props.days.map((d, i) => {
    const date = dashParseDay(d.date)
    // Stack renders bottom-up in the server's largest-first order.
    let cursor = TOP + CHART_H
    const usable = CHART_H - SEG_GAP * Math.max(0, d.segments.length - 1)
    const segs: Seg[] = d.segments.map((s) => {
      const h = Math.max(MIN_SEG, (s.sec / maxDaySec.value) * usable)
      cursor -= h
      const seg: Seg = {
        key: s.key,
        y: Math.max(TOP, cursor),
        h,
        color: colorByKey.value.get(s.key) ?? 'var(--ui-border-accented)',
        title: `${s.label}: ${dashDuration(s.sec)}`
      }
      cursor -= SEG_GAP
      return seg
    })
    return {
      date: d.date,
      x: `${(i + 0.07) * cell}%`,
      w: `${cell * 0.86}%`,
      cx: `${(i + 0.5) * cell}%`,
      label: n > 7 ? String(date.getDate()) : date.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: dashIsToday(d.date),
      total: d.totalSec ? (d.totalSec / 3600).toFixed(1) : '',
      segs
    }
  })
})

const svgEl = ref<SVGSVGElement | null>(null)

function growIn() {
  if (dashReducedMotion() || !svgEl.value) return
  const cols = svgEl.value.querySelectorAll('[data-col]')
  if (cols.length) {
    gsap.from(cols, {
      scaleY: 0,
      transformOrigin: '50% 100%',
      duration: 0.4,
      ease: 'power2.out',
      stagger: 0.02
    })
  }
}

onMounted(growIn)
// Re-run the draw-in when the range or grouping swaps the data set.
watch(() => props.days, () => nextTick(growIn))
</script>

<template>
  <UCard class="bg-elevated shadow-sm" :ui="{ body: 'p-4 px-5 sm:p-4 sm:px-5' }">
    <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h2 class="text-[15px] font-medium text-highlighted">Hours by day</h2>
      <span class="text-[11px] text-muted">stacked by {{ groupLabel }}</span>
      <div class="ml-auto flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-muted">
        <span v-for="l in legend" :key="l.key" class="inline-flex items-center gap-1.25">
          <span class="size-2 rounded-[2px]" :style="{ background: l.color }" />
          {{ l.label }}
        </span>
      </div>
    </div>

    <svg
      ref="svgEl"
      class="mt-4 block w-full"
      :height="TOP + CHART_H + BOTTOM"
      role="img"
      :aria-label="`Hours per day, stacked by ${groupLabel}`"
    >
      <g v-for="c in columns" :key="c.date">
        <text
          v-if="c.total"
          :x="c.cx"
          :y="TOP - 6"
          text-anchor="middle"
          class="tnum"
          font-size="10"
          fill="var(--ui-text-dimmed)"
        >{{ c.total }}</text>
        <g data-col>
          <rect
            v-for="(s, i) in c.segs"
            :key="i"
            :x="c.x"
            :width="c.w"
            :y="s.y"
            :height="s.h"
            rx="3"
            :fill="s.color"
          >
            <title>{{ s.title }}</title>
          </rect>
        </g>
        <text
          :x="c.cx"
          :y="TOP + CHART_H + 16"
          text-anchor="middle"
          font-size="11"
          :fill="c.isToday ? 'var(--ui-primary)' : 'var(--ui-text-dimmed)'"
        >{{ c.label }}</text>
      </g>
    </svg>
  </UCard>
</template>
