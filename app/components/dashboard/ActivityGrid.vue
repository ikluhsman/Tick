<script setup lang="ts">
// Activity heat grid: 16 week columns × Mon–Fri rows of 13px accent dots.
// Opacity encodes hours (0.1 none → 0.25–1.0 by share of the busiest day);
// days at ≥75% of the max get a soft accent glow. GSAP staggers the dots in.
//
// Accessible grid (role="grid"/"row"/"rowheader"/"gridcell") laid out as real
// weekday ROWS × week COLUMNS — the DOM now matches what it looks like, rather
// than a column-major div per week with a separately-aligned label column.
// Roving tabindex: one cell is tabbable at a time (default: the most recent
// day); arrow keys move it, Home/End jump to the row's first/last week. The
// native `title` still covers pointer hover; the readout line under the grid
// covers keyboard focus (and pointer hover) for sighted users who can't see a
// hover-only tooltip while tabbing — it's `aria-hidden` because screen reader
// users already get the same text as each gridcell's accessible name when
// focus lands on it.
import { gsap } from 'gsap'

const props = defineProps<{ summary: DashboardSummary }>()

type ActivityDay = DashboardSummary['activity'][number]

/** Mobile shows the last 12 weeks so the dots fit without scrolling (README §Mobile). */
const isDesktop = useMediaQuery('(min-width: 1024px)', { ssrWidth: 1280 })
const weekCount = computed(() => (isDesktop.value ? 16 : 12))

/** Oldest week first, 5 workdays per column. */
const weeks = computed<ActivityDay[][]>(() => {
  const out: ActivityDay[][] = []
  for (let i = 0; i < props.summary.activity.length; i += 5) {
    out.push(props.summary.activity.slice(i, i + 5))
  }
  return out.slice(-weekCount.value)
})

const WEEKDAY_LABELS = ['M', 'T', 'W', 'R', 'F']
/** Full names for the (now visible, see rowheader markup below) sr-only text
 * — a bare "R" for Thursday reads as noise once a screen reader announces
 * the row header on entering a new row. */
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/** Row-major view over `weeks`: rowsData[weekday][week]. */
const rowsData = computed<ActivityDay[][]>(() =>
  WEEKDAY_LABELS.map((_, di) => weeks.value.map(week => week[di]).filter((d): d is ActivityDay => !!d))
)

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

// ── Roving tabindex ──────────────────────────────────────────────────────
interface Coord { row: number, col: number }

/** "2026-09-11", local time, zero-padded — matches server/api/summary/dashboard.get.ts's `fmtDay`. */
function fmtToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Default focus target: the most recent day ON OR BEFORE today. The window
 * always includes the current (possibly incomplete) week, so its later
 * weekdays can be future dates with nothing logged yet — walking from the
 * last week/weekday backwards to the first `date <= today` skips those
 * rather than defaulting onto a day that hasn't happened. */
const mostRecentCoord = computed<Coord>(() => {
  const today = fmtToday()
  for (let col = weeks.value.length - 1; col >= 0; col--) {
    const week = weeks.value[col]!
    for (let row = week.length - 1; row >= 0; row--) {
      if (week[row] && week[row]!.date <= today) return { row, col }
    }
  }
  return { row: 0, col: 0 }
})

/** Explicit focus once the user has moved it; null = "use the default". */
const movedFocus = ref<Coord | null>(null)
const hovered = ref<Coord | null>(null)

// A week-count change (desktop ↔ mobile breakpoint) can invalidate an
// explicit coordinate — fall back to the (recomputed) default rather than
// pointing at a cell that no longer exists.
watch(weekCount, () => { movedFocus.value = null })

const focusedCoord = computed<Coord>(() => movedFocus.value ?? mostRecentCoord.value)

function cellAt(c: Coord | null): ActivityDay | undefined {
  return c ? rowsData.value[c.row]?.[c.col] : undefined
}

const displayedDay = computed(() => cellAt(hovered.value) ?? cellAt(focusedCoord.value))
const readout = computed(() => displayedDay.value ? dotTitle(displayedDay.value) : '')

function isTabbable(row: number, col: number) {
  return focusedCoord.value.row === row && focusedCoord.value.col === col
}

const gridEl = ref<HTMLElement | null>(null)

function setFocus(row: number, col: number) {
  const r = Math.max(0, Math.min(row, WEEKDAY_LABELS.length - 1))
  const rowLen = rowsData.value[r]?.length ?? 1
  const c = Math.max(0, Math.min(col, rowLen - 1))
  movedFocus.value = { row: r, col: c }
  nextTick(() => {
    gridEl.value?.querySelector<HTMLElement>(`[data-row="${r}"][data-col="${c}"]`)?.focus()
  })
}

function onCellKeydown(e: KeyboardEvent, row: number, col: number) {
  const lastRow = WEEKDAY_LABELS.length - 1
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); setFocus(row, col - 1); break
    case 'ArrowRight': e.preventDefault(); setFocus(row, col + 1); break
    case 'ArrowUp': e.preventDefault(); setFocus(row - 1, col); break
    case 'ArrowDown': e.preventDefault(); setFocus(row + 1, col); break
    case 'Home':
      e.preventDefault()
      e.ctrlKey ? setFocus(0, 0) : setFocus(row, 0)
      break
    case 'End':
      e.preventDefault()
      e.ctrlKey ? setFocus(lastRow, (rowsData.value[lastRow]?.length ?? 1) - 1) : setFocus(row, (rowsData.value[row]?.length ?? 1) - 1)
      break
  }
}

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
      <span class="text-[11px] text-muted">last {{ weekCount }} weeks · brighter means more time logged</span>
    </div>
    <div
      ref="gridEl"
      role="grid"
      :aria-label="`Weekday activity heatmap, last ${weekCount} weeks`"
      class="mt-1 -mx-1 flex flex-col gap-1.75 overflow-x-auto p-1"
    >
      <div
        v-for="(row, ri) in rowsData"
        :key="WEEKDAY_LABELS[ri]"
        role="row"
        class="flex items-center gap-2.5"
      >
        <span role="rowheader" class="w-3.5 shrink-0 text-[10px] leading-3.25 text-muted">
          <span aria-hidden="true">{{ WEEKDAY_LABELS[ri] }}</span>
          <span class="sr-only">{{ WEEKDAY_NAMES[ri] }}</span>
        </span>
        <div class="flex flex-1 justify-between gap-1.75">
          <!-- The focusable cell stays at full opacity so the focus-visible
               outline (main.css) never fades — CSS `opacity` dims outlines
               along with everything else. Intensity lives on the inner
               aria-hidden dot instead; GSAP's stagger-in also targets it via
               [data-dot], which is why `opacity: 0` in that animation is safe
               (it's the same element opacity is already dotStyle'd onto). -->
          <span
            v-for="(d, ci) in row"
            :key="d.date"
            role="gridcell"
            :data-row="ri"
            :data-col="ci"
            :aria-label="dotTitle(d)"
            :title="dotTitle(d)"
            :tabindex="isTabbable(ri, ci) ? 0 : -1"
            class="size-3.25 rounded-full"
            @focus="movedFocus = { row: ri, col: ci }"
            @mouseenter="hovered = { row: ri, col: ci }"
            @mouseleave="hovered = null"
            @keydown="onCellKeydown($event, ri, ci)"
          >
            <span aria-hidden="true" data-dot class="block size-full rounded-full" :style="dotStyle(d)" />
          </span>
        </div>
      </div>
    </div>
    <!-- Sighted-keyboard-user affordance: `title` only shows on pointer hover,
         so a value is also readable while tabbing. Hidden from screen readers
         — they already get this text as the focused gridcell's own name. -->
    <p aria-hidden="true" class="tnum mt-1.5 h-4 text-[11px] text-muted">{{ readout }}</p>
  </UCard>
</template>
