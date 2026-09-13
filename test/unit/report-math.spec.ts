// server/utils/pdf/report-data.ts — the money apportionment (largest remainder)
// and the shared report query schema.
//
// `buildReportSummary` / `buildReportDayTotals` are welded to Postgres (they are
// raw SQL over `db.execute`), so only their pure parts are unit-tested here; the
// SQL itself is covered by the integration/e2e suites.
//
// `apportionDollars` is module-private, and report-data.ts is not this spec's
// file to edit — so rather than duplicating the algorithm (a copy would drift
// and would stop testing the shipped code), the real function is lifted out of
// the source file, type-stripped with esbuild, and evaluated. If it is renamed
// or removed, extraction throws and this spec fails loudly.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { reportQuerySchema } from '../../server/utils/pdf/report-data'

const SRC = fileURLToPath(new URL('../../server/utils/pdf/report-data.ts', import.meta.url))

/** Slices `function <name>(...) { ... }` out of a TS source by brace matching. */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`report-data.ts no longer defines function ${name}()`)
  const open = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw new Error(`unbalanced braces while extracting ${name}()`)
}

const apportionDollars: (values: number[]) => number[] = (() => {
  const ts = extractFunction(readFileSync(SRC, 'utf8'), 'apportionDollars')
  const js = transformSync(ts, { loader: 'ts' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}\nreturn apportionDollars`)() as (values: number[]) => number[]
})()

const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0)

describe('apportionDollars — largest remainder', () => {
  it('is the real function from report-data.ts, not a copy', () => {
    expect(typeof apportionDollars).toBe('function')
    expect(apportionDollars.length).toBe(1)
  })

  it('returns no rows for no input', () => {
    expect(apportionDollars([])).toEqual([])
  })

  it('rounds a single row to the whole-dollar total', () => {
    expect(apportionDollars([166.25])).toEqual([166])
    expect(apportionDollars([166.75])).toEqual([167])
    expect(apportionDollars([0.4])).toEqual([0])
    expect(apportionDollars([0.6])).toEqual([1])
  })

  it('leaves already-whole amounts untouched', () => {
    expect(apportionDollars([100, 250, 25])).toEqual([100, 250, 25])
  })

  it('keeps all-zero rows at zero', () => {
    expect(apportionDollars([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('splits an even remainder without inventing dollars', () => {
    // 87.5 + 87.5 = 175 exactly: one row rounds up, one down — not 88 + 88.
    expect(apportionDollars([87.5, 87.5])).toEqual([88, 87])
    expect(sum(apportionDollars([87.5, 87.5]))).toBe(175)
  })

  it('hands leftover dollars to the largest fractions first', () => {
    // floors 0+0+0 = 0, target = round(2.7) = 3 → all three get a dollar.
    expect(apportionDollars([0.9, 0.9, 0.9])).toEqual([1, 1, 1])
    // floors 1+1+1 = 3, target = round(4.2) = 4 → the 0.5 fraction wins.
    expect(apportionDollars([1.5, 1.35, 1.35])).toEqual([2, 1, 1])
  })

  it('handles an awkward thirds split', () => {
    const out = apportionDollars([33.34, 33.33, 33.33])
    expect(sum(out)).toBe(100)
    expect(out).toEqual([34, 33, 33])
  })

  it('gives the leftover to the biggest fraction, not the first row', () => {
    const out = apportionDollars([10.1, 10.8, 10.1])
    expect(out).toEqual([10, 11, 10])
    expect(sum(out)).toBe(31)
  })

  it('never returns a negative row for non-negative input', () => {
    for (const out of [apportionDollars([0.1, 0.1, 0.1]), apportionDollars([0, 0.49])]) {
      expect(out.every(v => v >= 0)).toBe(true)
    }
  })

  it('does not mutate its input', () => {
    const input = [1.4, 2.6, 3.5]
    const copy = [...input]
    apportionDollars(input)
    expect(input).toEqual(copy)
  })

  describe('invariant: sum(rounded rows) === round(sum(values))', () => {
    const cases: number[][] = [
      [],
      [0],
      [0.5],
      [0.49],
      [1e-9],
      [0, 0, 0, 0],
      [87.5, 87.5],
      [33.34, 33.33, 33.33],
      [0.9, 0.9, 0.9, 0.9, 0.9],
      [1000.005, 0.005],
      [12.99, 0.01],
      [5, 0, 7.5, 0, 2.5],
      [166.25, 91.875, 42.875]
    ]
    for (const values of cases) {
      it(`holds for ${JSON.stringify(values)}`, () => {
        const out = apportionDollars(values)
        expect(out).toHaveLength(values.length)
        expect(out.every(Number.isInteger)).toBe(true)
        expect(sum(out)).toBe(Math.round(sum(values)))
      })
    }

    it('holds over a deterministic spread of 500 random row sets', () => {
      // Seeded LCG — no Math.random, no clock: the same 500 cases every run.
      let seed = 0x2f6e2b1
      const next = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / 0x7fffffff
      }
      for (let n = 0; n < 500; n++) {
        const len = 1 + Math.floor(next() * 8)
        const values = Array.from({ length: len }, () => Math.round(next() * 50000) / 100)
        const out = apportionDollars(values)
        expect(out).toHaveLength(len)
        expect(out.every(Number.isInteger)).toBe(true)
        expect(sum(out)).toBe(Math.round(sum(values)))
        // Each row stays within a dollar of its exact value.
        out.forEach((v, i) => {
          expect(v).toBeGreaterThanOrEqual(Math.floor(values[i]!))
          expect(v).toBeLessThanOrEqual(Math.floor(values[i]!) + 1)
        })
      }
    })
  })
})

describe('reportQuerySchema', () => {
  it('parses ISO dates and applies the documented defaults', () => {
    const out = reportQuerySchema.parse({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-08T00:00:00.000Z'
    })
    expect(out.from.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(out.to.toISOString()).toBe('2026-09-08T00:00:00.000Z')
    expect(out.billable).toBe('all')
    expect(out.groupBy).toBe('project')
  })

  it('accepts every documented billable filter and grouping', () => {
    for (const billable of ['all', 'billable', 'nonbillable'] as const) {
      for (const groupBy of ['client', 'project', 'task', 'tag'] as const) {
        const out = reportQuerySchema.parse({
          from: '2026-09-01',
          to: '2026-09-08',
          billable,
          groupBy
        })
        expect(out).toMatchObject({ billable, groupBy })
      }
    }
  })

  it('rejects an unparseable date', () => {
    expect(reportQuerySchema.safeParse({ from: 'yesterday', to: '2026-09-08' }).success).toBe(false)
  })

  it('rejects an unknown grouping or billable filter', () => {
    const base = { from: '2026-09-01', to: '2026-09-08' }
    expect(reportQuerySchema.safeParse({ ...base, groupBy: 'tags' }).success).toBe(false)
    expect(reportQuerySchema.safeParse({ ...base, billable: 'yes' }).success).toBe(false)
  })

  it('requires both ends of the range', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-09-01' }).success).toBe(false)
    expect(reportQuerySchema.safeParse({}).success).toBe(false)
  })
})
