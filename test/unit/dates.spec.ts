import { describe, expect, it } from 'vitest'
import { parseGridDate } from '../e2e/helpers/dates'

/**
 * Timezone note: every Date below is built from LOCAL components, matching
 * the format.spec.ts convention — never build these from ISO strings.
 */

describe('parseGridDate', () => {
  it('pins the current year on a same-year date', () => {
    const today = new Date(2026, 2, 14) // Saturday 14 March 2026, local
    expect(parseGridDate('Wed, Mar 11', today)).toEqual(new Date(2026, 2, 11))
  })

  // The actual failure this guards: 2028's Jan 1 is a Saturday, so the
  // heatmap's "current week" (Mon–Fri) is entirely in the PREVIOUS year —
  // Dec 27–31, 2027. ActivityGrid's mostRecentCoord walks that week
  // backwards from Friday and stops at the first day `<= today`, i.e. Fri
  // Dec 31 2027 (the last day before Jan 1 2028). Its label has no year
  // ("Fri, Dec 31"); naively appending today's year (2028) reads that as
  // Dec 31 2028 — 365 days in the FUTURE — and fails a perfectly correct
  // cell. The nearest-year search must instead land on 2027.
  it('falls back to the previous year across a Jan-1-on-Saturday boundary', () => {
    const today = new Date(2028, 0, 1) // Saturday 1 January 2028, local
    const parsed = parseGridDate('Fri, Dec 31', today)
    expect(parsed).toEqual(new Date(2027, 11, 31))
    expect(parsed.getTime()).toBeLessThanOrEqual(today.getTime())
  })

  it('does not launder a genuine future-day bug into the previous year', () => {
    // A real regression: the cell one day ahead of "today", same year — the
    // ±1-year candidates are ~365 days away and must not win over it.
    const today = new Date(2026, 2, 14) // Saturday 14 March 2026, local
    const parsed = parseGridDate('Sun, Mar 15', today)
    expect(parsed).toEqual(new Date(2026, 2, 15))
    expect(parsed.getTime()).toBeGreaterThan(today.getTime())
  })

  it('handles the exact boundary: today itself', () => {
    const today = new Date(2028, 0, 1)
    expect(parseGridDate('Sat, Jan 1', today)).toEqual(today)
  })
})
