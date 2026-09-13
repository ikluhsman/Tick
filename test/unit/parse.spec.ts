import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDate, parseDuration, parseEstimate, parseTime } from '../../app/utils/parse'

/**
 * Reference "now" for every relative-date case: Saturday 14 March 2026, 10:30
 * local time. Built from local components on purpose — the calendar date (and
 * therefore its weekday) is identical in every timezone, so these tests pass
 * wherever CI runs and whatever day it runs on.
 */
const REF = new Date(2026, 2, 14, 10, 30, 0)

/** Compare a parsed date by local Y/M/D — timezone-stable, unlike toISOString(). */
function ymd(d: Date | null): string | null {
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

afterEach(() => {
  vi.useRealTimers()
})

describe('parseDate — absolute formats (docs: guide/timer-and-entries)', () => {
  it.each([
    ['ISO', '2026-03-14'],
    ['US numeric, 2-digit year', '3/14/26'],
    ['US numeric, 4-digit year', '3/14/2026'],
    ['US numeric, dots', '3.14.2026'],
    ['month-day, year omitted', 'mar 14'],
    ['month-day with ordinal + year', 'march 14th, 2026'],
    ['day-month', '14 mar 2026'],
    ['day-month with ordinal', '14th march 2026']
  ])('%s: %s → 2026-03-14', (_label, input) => {
    expect(ymd(parseDate(input, REF))).toBe('2026-03-14')
  })

  it('US numeric without a year uses the reference year', () => {
    expect(ymd(parseDate('3/14', REF))).toBe('2026-03-14')
  })

  it('month-day without a year uses the reference year', () => {
    expect(ymd(parseDate('mar 14', new Date(2019, 0, 1)))).toBe('2019-03-14')
  })

  it('returns local midnight, not UTC midnight', () => {
    const d = parseDate('2026-03-14', REF)!
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getMilliseconds()).toBe(0)
  })

  it('tolerates surrounding whitespace and mixed case', () => {
    expect(ymd(parseDate('   MAR 14   ', REF))).toBe('2026-03-14')
    expect(ymd(parseDate('\t2026-03-14 ', REF))).toBe('2026-03-14')
    expect(ymd(parseDate('  ToDaY  ', REF))).toBe('2026-03-14')
    expect(ymd(parseDate('14TH March 2026', REF))).toBe('2026-03-14')
  })
})

describe('parseDate — relative words', () => {
  it('today / empty → the reference day', () => {
    expect(ymd(parseDate('today', REF))).toBe('2026-03-14')
    // Documented: empty input means today.
    expect(ymd(parseDate('', REF))).toBe('2026-03-14')
    expect(ymd(parseDate('   ', REF))).toBe('2026-03-14')
  })

  it('yesterday → the day before the reference day', () => {
    expect(ymd(parseDate('yesterday', REF))).toBe('2026-03-13')
  })

  it('crosses a month (and year) boundary correctly', () => {
    expect(ymd(parseDate('yesterday', new Date(2026, 0, 1, 9, 0)))).toBe('2025-12-31')
  })

  it('uses the system clock when no reference date is passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(REF)
    expect(ymd(parseDate('today'))).toBe('2026-03-14')
    expect(ymd(parseDate('yesterday'))).toBe('2026-03-13')
    expect(ymd(parseDate('tue'))).toBe('2026-03-10')
  })
})

describe('parseDate — weekdays (most recent strictly-past occurrence)', () => {
  // REF is a Saturday; the preceding Tuesday is 2026-03-10.
  it.each([
    ['tue', '2026-03-10'],
    ['last tue', '2026-03-10'],
    ['tuesday', '2026-03-10'],
    ['LAST Tuesday', '2026-03-10'],
    ['fri', '2026-03-13'],
    ['sun', '2026-03-08'],
    ['mon', '2026-03-09'],
    ['wed', '2026-03-11'],
    ['thu', '2026-03-12']
  ])('%s → %s', (input, expected) => {
    expect(ymd(parseDate(input, REF))).toBe(expected)
  })

  it('the reference weekday itself resolves to a week earlier, never today', () => {
    // REF is Saturday 2026-03-14 → "sat" must be 2026-03-07.
    expect(ymd(parseDate('sat', REF))).toBe('2026-03-07')
    expect(ymd(parseDate('saturday', REF))).toBe('2026-03-07')
  })

  it('does not skip a day across a DST spring-forward', () => {
    // Regression: day arithmetic used to subtract a flat 86_400_000 ms, which
    // on a 23-hour day landed at 23:00 of the *previous* day — so "sun" from
    // Sat 14 Mar 2026 returned 1 Mar instead of 8 Mar in US zones, and
    // "yesterday" on 9 Mar returned 7 Mar. In a DST-free zone (e.g. UTC CI)
    // these assertions are simply the plain calendar answers.
    expect(ymd(parseDate('sun', REF))).toBe('2026-03-08')
    expect(ymd(parseDate('yesterday', new Date(2026, 2, 9, 12, 0)))).toBe('2026-03-08')
    expect(ymd(parseDate('sat', new Date(2026, 2, 9, 12, 0)))).toBe('2026-03-07')
  })

  it('always returns local midnight, even across DST', () => {
    for (const input of ['yesterday', 'sun', 'mon', 'sat']) {
      const d = parseDate(input, new Date(2026, 2, 9, 12, 0))!
      expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
    }
  })

  it('always lands on the requested weekday, for every reference day of the week', () => {
    // Walk six weeks of reference days — every weekday, and both hemispheres'
    // 2026 DST switches (US 8 Mar, EU 29 Mar, AU 5 Apr) — so the test cannot
    // depend on "now" or on the CI timezone.
    for (let offset = 0; offset < 45; offset++) {
      const ref = new Date(2026, 2, 1 + offset)
      for (let wd = 0; wd < 7; wd++) {
        const target = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][wd]!
        const d = parseDate(target, ref)!
        expect(d.getDay()).toBe(wd)
        expect(d.getTime()).toBeLessThan(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime())
        expect(d.getTime()).toBeGreaterThanOrEqual(
          new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 7).getTime()
        )
      }
    }
  })
})

describe('parseDate — invalid input returns null (no silent guess)', () => {
  it.each([
    ['unreadable word', 'blah'],
    ['impossible numeric date', '13/45/99'],
    ['Feb 30 is rejected, not rolled over', '2026-02-30'],
    ['ISO month out of range', '2026-13-01'],
    ['bad month name', 'smarch 14'],
    ['nonsense that Date() also refuses', '99 99 99']
  ])('%s: %s → null', (_label, input) => {
    expect(parseDate(input, REF)).toBeNull()
  })

  it('an empty string is NOT an error — it means today', () => {
    expect(parseDate('', REF)).not.toBeNull()
  })
})

describe('parseTime → minutes since midnight', () => {
  it.each<[string, number]>([
    ['9', 9 * 60],
    ['9:30', 9 * 60 + 30],
    ['2pm', 14 * 60],
    ['2:05pm', 14 * 60 + 5],
    ['2:30 pm', 14 * 60 + 30],
    ['14:15', 14 * 60 + 15],
    ['09:05', 9 * 60 + 5],
    ['9a', 9 * 60],
    ['9p', 21 * 60],
    ['12am', 0],
    ['12pm', 12 * 60],
    ['12:30am', 30],
    ['  2PM  ', 14 * 60],
    ['0:00', 0],
    ['23:59', 23 * 60 + 59]
  ])('%s → %i', (input, expected) => {
    expect(parseTime(input)).toBe(expected)
  })

  it.each([['25:00'], ['abc'], ['9:75'], [''], ['24:00'], ['9:5'], ['-1']])(
    '%s → null',
    (input) => {
      expect(parseTime(input)).toBeNull()
    }
  )
})

describe('parseDuration → whole minutes', () => {
  it.each<[string, number]>([
    ['2h 30m', 150],
    ['2h30m', 150],
    ['1.5h', 90],
    ['90m', 90],
    ['1:30', 90],
    ['45m', 45],
    ['2h', 120],
    ['2', 120],
    ['0.25h', 15],
    ['  2H 30M  ', 150],
    ['0m', 0],
    ['1h 05m', 65],
    ['40h', 2400]
  ])('%s → %i', (input, expected) => {
    expect(parseDuration(input)).toBe(expected)
  })

  it.each([['', 'empty'], ['abc', 'junk'], ['-5m', 'negative'], ['abc 5m', 'junk + token'], ['1:5', 'bad h:mm']])(
    '%s (%s) → null',
    (input) => {
      expect(parseDuration(input)).toBeNull()
    }
  )

  it('parseEstimate shares the duration grammar (docs: "40h", "2h 30m")', () => {
    expect(parseEstimate('40h')).toBe(2400)
    expect(parseEstimate('2h 30m')).toBe(150)
    expect(parseEstimate('90m')).toBe(90)
    expect(parseEstimate('nope')).toBeNull()
  })
})
