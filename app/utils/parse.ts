// Free-text parsers for the Manual-entry dialog (and estimate fields elsewhere).
// Pure functions, unit-testable. Dates come back at local midnight; times and
// durations come back in minutes so callers can compose them.

const DAY_MS = 86_400_000
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** new Date(y, m, d) that rejects rollovers (Feb 30 → null instead of Mar 2). */
function makeDate(year: number, monthIndex: number, day: number): Date | null {
  const d = new Date(year, monthIndex, day)
  return d.getFullYear() === year && d.getMonth() === monthIndex && d.getDate() === day ? d : null
}

/**
 * Parse a free-text date. Accepted forms (per the design spec):
 * `2025-03-14` · `3/14/25` · `3.14.25` · `mar 14` · `mar 14, 2025` ·
 * `14 mar 2025` · `today` · `yesterday` · `last tue` · `tue` (most recent
 * strictly-past occurrence). Empty input means today. Returns local midnight
 * or null when unreadable.
 */
export function parseDate(input: string, ref: Date = new Date()): Date | null {
  const s = (input ?? '').trim().toLowerCase()
  const today = atMidnight(ref)
  if (!s || s === 'today') return today
  if (s === 'yesterday') return new Date(today.getTime() - DAY_MS)

  let m: RegExpMatchArray | null

  // "tue" / "tuesday" / "last tue" → most recent past occurrence of that weekday
  if ((m = s.match(/^(?:last\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/))) {
    const wd = WEEKDAYS.indexOf(m[1]!)
    let d = today
    do {
      d = new Date(d.getTime() - DAY_MS)
    } while (d.getDay() !== wd)
    return d
  }

  // ISO: 2025-03-14
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return makeDate(+m[1]!, +m[2]! - 1, +m[3]!)
  }

  // US numeric: 3/14, 3/14/25, 3.14.2025
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/))) {
    let year = m[3] ? +m[3] : today.getFullYear()
    if (year < 100) year += 2000
    return makeDate(year, +m[1]! - 1, +m[2]!)
  }

  // "mar 14" / "march 14th, 2025"
  if ((m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/))) {
    const mi = MONTHS.indexOf(m[1]!.slice(0, 3))
    if (mi >= 0) return makeDate(m[3] ? +m[3] : today.getFullYear(), mi, +m[2]!)
    return null
  }

  // "14 mar" / "14th march 2025"
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?$/))) {
    const mi = MONTHS.indexOf(m[2]!.slice(0, 3))
    if (mi >= 0) return makeDate(m[3] ? +m[3] : today.getFullYear(), mi, +m[1]!)
    return null
  }

  // Last resort: whatever the Date constructor can make of it (sane years only)
  const d = new Date(input)
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 1970 && d.getFullYear() <= 2100) {
    return atMidnight(d)
  }
  return null
}

/**
 * Parse a clock time — `9`, `9:30`, `2pm`, `14:15`, `2:30 pm`, `9a`.
 * Returns minutes since midnight, or null.
 */
export function parseTime(input: string): number | null {
  const m = (input ?? '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\.?$/)
  if (!m) return null
  let h = +m[1]!
  const min = +(m[2] ?? 0)
  const ap = m[3]?.[0]
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Parse a duration — `2h 30m`, `1.5h`, `90m`, `1:30`, bare `2` (hours).
 * Returns whole minutes, or null.
 */
export function parseDuration(input: string): number | null {
  const s = (input ?? '').trim().toLowerCase()
  if (!s) return null
  let m: RegExpMatchArray | null
  // bare number or "1.5h" → hours
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h?$/))) return Math.round(+m[1]! * 60)
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/)
  const mm = s.match(/(\d+)\s*m/)
  if (!h && !mm) {
    // "1:30" → h:mm
    if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) return +m[1]! * 60 + +m[2]!
    return null
  }
  return Math.round((h ? +h[1]! * 60 : 0) + (mm ? +mm[1]! : 0))
}

/** Project/task estimates use the same grammar as durations ("40h", "2h 30m"). Minutes or null. */
export function parseEstimate(input: string): number | null {
  return parseDuration(input)
}
