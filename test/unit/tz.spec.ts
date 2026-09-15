// app/utils/tz.ts — the timezone arithmetic behind ticktimer/Tick#7.
//
// These cases pin real UTC offsets (including DST transitions and a :45 zone),
// so they hold whatever timezone the machine running them is in — which is the
// whole point: the server and the browser disagree, and this module is what
// makes the two renders agree anyway.
import { describe, expect, it } from 'vitest'
import {
  addDaysInstant,
  dayKeyIn,
  instantAtWallTime,
  isValidTimeZone,
  runtimeTimeZone,
  startOfDayInstant,
  tzOffsetMs,
  zonedDate
} from '../../app/utils/tz'

const HOUR = 3_600_000

/** 2026-06-15T12:00:00Z — northern summer, so US/EU zones are on DST. */
const SUMMER = Date.parse('2026-06-15T12:00:00Z')
/** 2026-01-15T12:00:00Z — northern winter, standard time. */
const WINTER = Date.parse('2026-01-15T12:00:00Z')

describe('tzOffsetMs', () => {
  it('reads a fixed-offset zone', () => {
    expect(tzOffsetMs('UTC', SUMMER)).toBe(0)
    expect(tzOffsetMs('Etc/GMT+5', SUMMER)).toBe(-5 * HOUR) // Etc signs are inverted
  })

  it('follows DST rather than assuming a constant offset', () => {
    // Denver: UTC-7 in winter, UTC-6 on daylight time.
    expect(tzOffsetMs('America/Denver', WINTER)).toBe(-7 * HOUR)
    expect(tzOffsetMs('America/Denver', SUMMER)).toBe(-6 * HOUR)
    // Sydney runs the other way round.
    expect(tzOffsetMs('Australia/Sydney', WINTER)).toBe(11 * HOUR)
    expect(tzOffsetMs('Australia/Sydney', SUMMER)).toBe(10 * HOUR)
  })

  it('handles zones that are not whole hours off', () => {
    expect(tzOffsetMs('Asia/Kolkata', SUMMER)).toBe(5.5 * HOUR)
    expect(tzOffsetMs('Pacific/Chatham', WINTER)).toBe(13.75 * HOUR)
  })
})

describe('zonedDate', () => {
  it('makes local getters read as the target zone', () => {
    // 12:00Z is 06:00 in Denver on daylight time.
    const z = zonedDate(SUMMER, 'America/Denver')
    expect(z.getHours()).toBe(6)
    expect(z.getMinutes()).toBe(0)
    expect(z.getDate()).toBe(15)
  })

  it('crosses the date line when the zone does', () => {
    // 2026-09-14T23:30Z is already the 15th in Tokyo, still the 14th in Denver.
    const ts = Date.parse('2026-09-14T23:30:00Z')
    expect(zonedDate(ts, 'Asia/Tokyo').getDate()).toBe(15)
    expect(zonedDate(ts, 'America/Denver').getDate()).toBe(14)
  })

  it('is the identity for the runtime zone, so the browser render is untouched', () => {
    const z = zonedDate(SUMMER, runtimeTimeZone())
    expect(z.getTime()).toBe(SUMMER)
  })

  it('keeps half-hour zones honest', () => {
    const z = zonedDate(SUMMER, 'Asia/Kolkata')
    expect(`${z.getHours()}:${String(z.getMinutes()).padStart(2, '0')}`).toBe('17:30')
  })

  it('returns an invalid date for an unparseable input rather than throwing', () => {
    expect(Number.isNaN(zonedDate('not a date', 'UTC').getTime())).toBe(true)
  })
})

describe('dayKeyIn', () => {
  it('buckets an instant by the day it falls on in that zone', () => {
    const ts = Date.parse('2026-09-14T23:30:00Z')
    expect(dayKeyIn(ts, 'Asia/Tokyo')).toBe('2026-09-15')
    expect(dayKeyIn(ts, 'UTC')).toBe('2026-09-14')
    expect(dayKeyIn(ts, 'America/Denver')).toBe('2026-09-14')
  })

  it('is the bug from the issue: an entry near midnight groups under the wrong day', () => {
    // 01:00Z on the 15th — the 14th for anyone west of UTC. A server in UTC
    // grouped this under the 15th while the browser said the 14th.
    const ts = Date.parse('2026-09-15T01:00:00Z')
    expect(dayKeyIn(ts, 'UTC')).toBe('2026-09-15')
    expect(dayKeyIn(ts, 'America/Denver')).toBe('2026-09-14')
  })

  it('zero-pads, so keys sort lexicographically', () => {
    expect(dayKeyIn(Date.parse('2026-03-05T12:00:00Z'), 'UTC')).toBe('2026-03-05')
  })
})

describe('isValidTimeZone', () => {
  it('accepts IANA names', () => {
    expect(isValidTimeZone('America/Denver')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
  })

  it('rejects anything a cookie could otherwise smuggle in', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
  })
})

describe('instantAtWallTime', () => {
  it('is the inverse of zonedDate', () => {
    for (const tz of ['UTC', 'America/Denver', 'Asia/Kolkata', 'Pacific/Chatham', 'Australia/Sydney']) {
      const z = zonedDate(SUMMER, tz)
      const back = instantAtWallTime(
        tz, z.getFullYear(), z.getMonth() + 1, z.getDate(), z.getHours(), z.getMinutes()
      )
      expect(back).toBe(SUMMER)
    }
  })

  it('resolves midnight to a real epoch, not a shifted one', () => {
    // Midnight on 2026-09-14 in Denver (UTC-6 on DST) is 06:00Z.
    expect(instantAtWallTime('America/Denver', 2026, 9, 14)).toBe(Date.parse('2026-09-14T06:00:00Z'))
    expect(instantAtWallTime('UTC', 2026, 9, 14)).toBe(Date.parse('2026-09-14T00:00:00Z'))
  })

  it('lands on the right side of a DST change', () => {
    // US DST ends 2026-11-01. Midnight before is UTC-6, the next midnight UTC-7.
    expect(instantAtWallTime('America/Denver', 2026, 11, 1)).toBe(Date.parse('2026-11-01T06:00:00Z'))
    expect(instantAtWallTime('America/Denver', 2026, 11, 2)).toBe(Date.parse('2026-11-02T07:00:00Z'))
  })
})

describe('addDaysInstant', () => {
  it('steps whole calendar days, not fixed 24h blocks', () => {
    // Across the DST end, "one day later" is 25 hours of real time.
    const start = instantAtWallTime('America/Denver', 2026, 11, 1)
    const next = addDaysInstant(start, 'America/Denver', 1)
    expect(next - start).toBe(25 * 3_600_000)
  })

  it('walks a week in the zone the user is in', () => {
    const mon = instantAtWallTime('Asia/Kolkata', 2026, 9, 14)
    expect(addDaysInstant(mon, 'Asia/Kolkata', 7)).toBe(instantAtWallTime('Asia/Kolkata', 2026, 9, 21))
  })
})

describe('startOfDayInstant', () => {
  it('is the user’s midnight, not the runtime’s', () => {
    const ts = Date.parse('2026-09-15T01:00:00Z')
    expect(startOfDayInstant(ts, 'America/Denver')).toBe(Date.parse('2026-09-14T06:00:00Z'))
    expect(startOfDayInstant(ts, 'UTC')).toBe(Date.parse('2026-09-15T00:00:00Z'))
  })
})
