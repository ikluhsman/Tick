<script setup lang="ts">
// Billable-this-week donut: r50/stroke8 SVG, neutral track, accent arc with a
// soft drop-shadow glow, percentage centered, legend beneath. GSAP draws the
// arc in via stroke-dashoffset on mount.
import { gsap } from 'gsap'

const props = defineProps<{ summary: DashboardSummary }>()

const CIRC = 2 * Math.PI * 50

const pct = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.summary.billablePct)))
)
const arcLen = computed(() => (pct.value / 100) * CIRC)
const nonBillableSec = computed(() =>
  Math.max(0, props.summary.weekSec - props.summary.weekBillableSec)
)

const arcEl = ref<SVGCircleElement | null>(null)

onMounted(() => {
  if (dashReducedMotion() || !arcEl.value || arcLen.value <= 0) return
  gsap.from(arcEl.value, {
    strokeDashoffset: arcLen.value,
    duration: 0.4,
    ease: 'power2.out'
  })
})
</script>

<template>
  <UCard class="bg-elevated shadow-sm" :ui="{ body: 'flex flex-col items-center p-4 sm:p-4' }">
    <h2 class="self-start text-[15px] font-medium text-highlighted">Billable this week</h2>
    <div class="relative my-0.5 size-35">
      <svg
        viewBox="0 0 120 120"
        width="140"
        height="140"
        class="-rotate-90"
        role="img"
        :aria-label="`${pct}% of tracked time this week is billable`"
      >
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ui-border)" stroke-width="8" />
        <circle
          ref="arcEl"
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="var(--ui-primary)"
          stroke-width="8"
          stroke-linecap="round"
          :stroke-dasharray="`${arcLen} ${CIRC}`"
          style="filter: drop-shadow(0 0 6px color-mix(in srgb, var(--ui-primary) 50%, transparent))"
        >
          <title>{{ dashDuration(summary.weekBillableSec) }} billable of {{ dashDuration(summary.weekSec) }} tracked</title>
        </circle>
      </svg>
      <div class="absolute inset-0 grid place-items-center text-center">
        <div>
          <div class="tnum text-2xl font-medium leading-none text-highlighted">{{ pct }}%</div>
          <div class="text-[11px] text-muted">billable</div>
        </div>
      </div>
    </div>
    <div class="flex gap-4 text-xs text-default">
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-full" style="background: var(--ui-primary)" />
        <span><span class="tnum">{{ dashDuration(summary.weekBillableSec) }}</span> billable</span>
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-full" style="background: var(--ui-border-accented)" />
        <span><span class="tnum">{{ dashDuration(nonBillableSec) }}</span> not</span>
      </span>
    </div>
  </UCard>
</template>
