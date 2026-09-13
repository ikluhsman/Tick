// Pure date-parsing helper for activity-grid.spec.ts (dashboard heatmap).
//
// ActivityGrid's gridcell aria-label / title comes from dotTitle()'s
// `toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })`
// — which never includes a year. The e2e spec has to pin one back on to
// compare the cell's date against "today", and naively assuming "today's
// year" breaks the one case where the displayed date and today straddle a
// year boundary: e.g. today is Sat Jan 3 2026, and the grid's default
// tabbable cell — "the most recent weekday on/before today"
// (ActivityGrid.vue's `mostRecentCoord`) — is Wed Dec 31 2025. Read as
// "Dec 31, <today's year>" that's Dec 31 2026: nearly a year in the future,
// so a same-year-only comparison flags a correct cell as a bug.
//
// Fix: try the neighbouring years too and keep whichever candidate lands
// closest to `today`. This still catches a genuine future-day regression —
// `mostRecentCoord` only ever walks a handful of days back from today
// (it stops at the first date `<= today` within the currently-displayed
// weeks), so a real bug's cell date is always close to today in the current
// year; the ±1-year candidates are ~365 days away and never win.
export function parseGridDate(datePart: string, today: Date): Date {
  const candidates = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]
    .map((year) => {
      const d = new Date(`${datePart}, ${year}`)
      d.setHours(0, 0, 0, 0)
      return d
    })
  return candidates.reduce((closest, d) =>
    Math.abs(d.getTime() - today.getTime()) < Math.abs(closest.getTime() - today.getTime()) ? d : closest)
}
