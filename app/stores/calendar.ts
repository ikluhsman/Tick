// Calendar store — visible range (week or day), anchor date, and the entries
// for that range. Week starts Monday. `view` is exposed so mobile can default
// to 'day' later. Move/resize commits optimistically and reverts on error;
// the server stays the source of truth for duration/amount (Rule 2).

export type CalendarView = 'week' | 'day'

/** Local start-of-day (ms) — day arithmetic via the Date ctor stays DST-safe. */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function addDays(t: number, n: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()
}

/** Monday 00:00 of the week containing t. */
function mondayOf(t: number): number {
  const d = new Date(t)
  return addDays(dayStart(d), -((d.getDay() + 6) % 7))
}

export const useCalendarStore = defineStore('calendar', () => {
  // SSR-safe fetch: forwards the request's cookies during server render;
  // plain $fetch on the client.
  const requestFetch = useRequestFetch()

  const view = ref<CalendarView>('week')
  /** Start-of-day (ms) the visible range anchors on. */
  const anchor = ref<number>(dayStart(new Date()))
  const entries = ref<EntryDto[]>([])
  const loading = ref(false)

  const rangeStart = computed(() => view.value === 'week' ? mondayOf(anchor.value) : anchor.value)
  const dayCount = computed(() => view.value === 'week' ? 7 : 1)
  const rangeEnd = computed(() => addDays(rangeStart.value, dayCount.value))
  /** Start-of-day timestamps of the visible columns. */
  const days = computed(() => Array.from({ length: dayCount.value }, (_, i) => addDays(rangeStart.value, i)))
  /** Whole weeks between the visible week and the current one (README state: weekOffset). */
  const weekOffset = computed(() =>
    Math.round((mondayOf(anchor.value) - mondayOf(dayStart(new Date()))) / (7 * 86_400_000))
  )

  function prev() {
    anchor.value = view.value === 'week' ? addDays(mondayOf(anchor.value), -7) : addDays(anchor.value, -1)
  }

  function next() {
    anchor.value = view.value === 'week' ? addDays(mondayOf(anchor.value), 7) : addDays(anchor.value, 1)
  }

  function today() {
    anchor.value = dayStart(new Date())
  }

  /**
   * Re-derive the anchor from the browser's clock, returning true when it moved.
   *
   * `anchor` is a *local* start-of-day, but during SSR "local" is the server's
   * timezone — UTC in the container — and the value rides the Pinia payload
   * into the browser. `days` normalises it back to browser midnights, so what
   * survives is the calendar *day* it lands on: a browser behind the server
   * reads the server's midnight as the previous day, and the grid shows that
   * day (or, when the server's day is a Monday, the whole previous week) with
   * none of today's entries on it — until a nav button re-derives the anchor
   * (ticktimer/Tick#29). On a page load the anchor is always "today" by
   * construction, so recomputing it here is exact.
   */
  function localizeAnchor() {
    const local = dayStart(new Date())
    if (anchor.value === local) return false
    anchor.value = local
    return true
  }

  function setView(v: CalendarView) {
    view.value = v
  }

  /** GET /api/entries for the visible range (running + trashed excluded server-side). */
  async function fetchRange() {
    loading.value = true
    try {
      entries.value = await requestFetch<EntryDto[]>('/api/entries', {
        query: { from: new Date(rangeStart.value).toISOString(), to: new Date(rangeEnd.value).toISOString() }
      })
    } finally {
      loading.value = false
    }
  }

  /** POST /api/entries (drag-to-create dialog). Keeps the new block in range. */
  async function create(payload: {
    name: string
    refType?: RefType
    refId?: string
    billable?: boolean
    start: string
    end: string
    tags?: string[]
  }) {
    const dto = await $fetch<EntryDto>('/api/entries', { method: 'POST', body: payload })
    if (new Date(dto.start).getTime() < rangeEnd.value && new Date(dto.start).getTime() >= rangeStart.value) {
      entries.value.push(dto)
    }
    return dto
  }

  /**
   * PATCH /api/entries/:id {start,end} after a drag-move / edge-resize.
   * Optimistic: the block paints at its new slot immediately; on failure the
   * snapshot is restored and the error rethrown for the caller to surface.
   */
  async function updateTimes(id: string, start: string, end: string) {
    const i = entries.value.findIndex(e => e.id === id)
    if (i < 0) return null
    const prevDto = entries.value[i]!
    const durationSec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    entries.value.splice(i, 1, { ...prevDto, start, end, durationSec })
    try {
      const dto = await $fetch<EntryDto>(`/api/entries/${id}`, { method: 'PATCH', body: { start, end } })
      const j = entries.value.findIndex(e => e.id === id)
      if (j >= 0) entries.value.splice(j, 1, dto)
      return dto
    } catch (err) {
      const j = entries.value.findIndex(e => e.id === id)
      if (j >= 0) entries.value.splice(j, 1, prevDto)
      throw err
    }
  }

  return {
    view,
    anchor,
    entries,
    loading,
    rangeStart,
    rangeEnd,
    dayCount,
    days,
    weekOffset,
    prev,
    next,
    today,
    localizeAnchor,
    setView,
    fetchRange,
    create,
    updateTimes
  }
})
