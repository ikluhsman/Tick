// Timezone helpers — pure functions, unit-testable (ticktimer/Tick#7).
//
// Every display formatter in this app reads a Date's *local* fields, and on the
// server "local" is the container's zone — UTC in the shipped image. So a server
// render spells times, day labels and day groupings in the server's zone, the
// browser re-renders them in its own, and Vue reports a hydration mismatch (an
// entry can even land under the wrong day near midnight).
//
// Rather than teach two dozen call sites to format with an explicit `timeZone`,
// these helpers move the *instant*: `zonedDate(d, tz)` returns a Date whose
// local fields already read as the wall clock in `tz`, so the existing
// formatters keep working unchanged. That Date is a display value only — its
// epoch is deliberately wrong, so never compare it with Date.now(), store it, or
// send it to the server. `zonedDate(d, runtimeTimeZone())` is the identity, so
// the browser pays nothing for this.

/** Parts of `ts` as read in `tz`, using Intl rather than a table of offsets. */
function partsIn(tz: string, ts: number): Record<string, number> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const out: Record<string, number> = {}
  for (const p of dtf.formatToParts(new Date(ts))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return out
}

/**
 * Offset of `tz` from UTC at `ts`, in ms (UTC+2 → +7_200_000). DST-correct,
 * because it asks Intl what the clock actually said at that instant.
 */
export function tzOffsetMs(tz: string, ts: number): number {
  const p = partsIn(tz, ts)
  // hour12:false gives 24 for midnight in some engines; Date.UTC handles the
  // rollover, but normalising keeps the arithmetic obvious.
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!)
  return asUtc - Math.floor(ts / 1000) * 1000
}

/** The zone this JavaScript runtime is in — the browser's, or the server's TZ. */
export function runtimeTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Is this a zone Intl accepts? Guards anything that came from a cookie. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * A Date whose *local* fields read as the wall clock in `tz`.
 *
 * Display only: the returned epoch is shifted and therefore meaningless. Pass it
 * to a formatter, read `.getHours()` / `.getDate()` off it — never compare it to
 * another instant. Returns an equal-valued Date when `tz` is the runtime zone,
 * so client renders are unaffected.
 */
export function zonedDate(d: Date | string | number, tz: string): Date {
  const ts = new Date(d).getTime()
  if (Number.isNaN(ts)) return new Date(Number.NaN)
  const local = -new Date(ts).getTimezoneOffset() * 60_000
  return new Date(ts + tzOffsetMs(tz, ts) - local)
}

/**
 * The real instant at which the clock in `tz` reads the given wall time — the
 * inverse of `zonedDate`, and the one that returns a genuine epoch you may
 * compare, store or send.
 *
 * Two passes: the first offset is looked up at the wrong instant by up to a
 * day's worth of offset, which only matters within an hour of a DST change; the
 * second uses the corrected instant and settles it.
 */
export function instantAtWallTime(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const once = wall - tzOffsetMs(tz, wall)
  return wall - tzOffsetMs(tz, once)
}

/** Midnight in `tz` as a real instant — the start of the day `d` falls on there. */
export function startOfDayInstant(d: Date | string | number, tz: string): number {
  const z = zonedDate(d, tz)
  return instantAtWallTime(tz, z.getFullYear(), z.getMonth() + 1, z.getDate())
}

/** `n` days after the day `d` falls on in `tz`, as a real instant (DST-safe). */
export function addDaysInstant(d: Date | string | number, tz: string, n: number): number {
  const z = zonedDate(d, tz)
  return instantAtWallTime(tz, z.getFullYear(), z.getMonth() + 1, z.getDate() + n)
}

/**
 * "2026-09-14" for the day `d` falls on in `tz` — the key to group entries by.
 * Stable across renders because it never reads the runtime zone.
 */
export function dayKeyIn(d: Date | string | number, tz: string): string {
  const z = zonedDate(d, tz)
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`
}
