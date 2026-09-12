<script setup lang="ts">
// Activity heat grid: 16 week columns × Mon–Fri rows of 13px accent dots.
// Opacity encodes hours (0.1 none → 0.25–1.0 by share of the busiest day);
// days at ≥75% of the max get a soft accent glow. GSAP staggers the dots in.
import { gsap } from 'gsap'

const props = defineProps<{ summary: DashboardSummary }>()

type ActivityDay = DashboardSummary['activity'][number]

/** Oldest week first, 5 workdays per column. */
const weeks = computed<ActivityDay[][]>(() => {
  const out: ActivityDay[][] = []
  for (let i = 0; i < props.summary.activity.length; i += 5) {
    out.push(props.summary.activity.slice(i, i + 5))
  }
  return out
})

const maxHours = computed(() =>
  Math.max(1, ...props.summary.activity.map(d => d.hours))
)

function dotStyle(d: ActivityDay) {
  const frac = Math.min(1, d.hours / maxHours.value)
  const opacity = d.hours <= 0 ? 0.1 : 0.25 + frac * 0.75
  return {
    background: 'var(--ui-primary)',
    opacity: opacity.toFixed(2),
    boxShadow: d.hours > 0 && frac >= 0.75
      ? '0 0 8px color-mix(in srgb, var(--ui-primary) 60%, transparent)'
      : 'none'
  }
}

function dotTitle(d: ActivityDay): string {
  const day = dashParseDay(d.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
  return `${day} · ${d.hours > 0 ? d.hours.toFixed(1) + 'h' : 'no time logged'}`
}

const gridEl = ref<HTMLElement | null>(null)

onMounted(() => {
  if (dashReducedMotion() || !gridEl.value) return
  const dots = gridEl.value.querySelectorAll('[data-dot]')
  if (dots.length) {
    gsap.from(dots, { opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.008 })
  }
})
</script>

<template>
  <UCard class="bg-elevated shadow-sm" :ui="{ body: 'p-4 sm:p-4' }">
    <div class="flex items-baseline gap-2.5">
      <h2 class="text-[15px] font-medium text-highlighted">Activity</h2>
      <span class="text-[11px] text-dimmed">last 16 weeks · brighter means more time logged</span>
    </div>
    <div class="mt-2 flex gap-2.5 overflow-x-auto">
      <!-- Row labels: M T W R F -->
      <div class="flex w-3.5 shrink-0 flex-col gap-1.75 text-[10px] text-dimmed" aria-hidden="true">
        <span v-for="l in ['M', 'T', 'W', 'R', 'F']" :key="l" class="h-3.25 leading-3.25">{{ l }}</span>
      </div>
      <!-- 16 week columns -->
      <div ref="gridEl" class="flex flex-1 justify-between gap-1.75">
        <div v-for="(week, w) in weeks" :key="w" class="flex flex-col gap-1.75">
          <span
            v-for="d in week"
            :key="d.date"
            data-dot
            :title="dotTitle(d)"
            class="size-3.25 rounded-full"
            :style="dotStyle(d)"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
