// GET /api/export/csv — the `csvField` escaping helper.
//
// The route module itself is imported (not re-implemented) so the assertions
// track the shipped code. Its only module-scope side effect is the
// `defineEventHandler(...)` call, which Nitro auto-imports at runtime; here it
// is stubbed to an identity before a dynamic import. Nothing else in the module
// body runs, so no HTTP, no DB, no session.
import { beforeAll, describe, expect, it, vi } from 'vitest'

type CsvField = (v: string | number | boolean | null) => string
let csvField: CsvField

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  const mod = await import('../../server/api/export/csv.get')
  csvField = mod.csvField
})

describe('csvField — RFC 4180 escaping', () => {
  it('leaves a plain field untouched', () => {
    expect(csvField('Intake form validation')).toBe('Intake form validation')
  })

  it('renders null/undefined-ish as an empty field', () => {
    expect(csvField(null)).toBe('')
  })

  it('keeps an empty string empty (not quoted)', () => {
    expect(csvField('')).toBe('')
  })

  it('quotes a field containing a comma', () => {
    expect(csvField('meeting, design')).toBe('"meeting, design"')
  })

  it('quotes and doubles embedded quotes', () => {
    expect(csvField('he said "hi"')).toBe('"he said ""hi"""')
  })

  it('quotes a field that is only a quote character', () => {
    expect(csvField('"')).toBe('""""')
  })

  it('quotes a field containing a newline', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"')
  })

  it('quotes a field containing CRLF', () => {
    expect(csvField('line one\r\nline two')).toBe('"line one\r\nline two"')
  })

  it('quotes a field containing a bare CR in the middle', () => {
    expect(csvField('a\rb')).toBe('"a\rb"')
  })

  it('handles commas, quotes and newlines together', () => {
    expect(csvField('a,"b"\nc')).toBe('"a,""b""\nc"')
  })
})

describe('csvField — spreadsheet formula injection guard', () => {
  // Excel/Sheets evaluate a cell starting with = + - @ TAB or CR on open
  // (=HYPERLINK, DDE, ...). Text fields get a leading apostrophe and are forced
  // into quotes; numeric and boolean fields are never touched.
  const risky: [string, string][] = [
    ['=1+1', '"\'=1+1"'],
    ['=HYPERLINK("http://evil","click")', '"\'=HYPERLINK(""http://evil"",""click"")"'],
    ['+1234567890', '"\'+1234567890"'],
    ['-1+1', '"\'-1+1"'],
    ['@SUM(A1:A9)', '"\'@SUM(A1:A9)"'],
    ['\tcmd', '"\'\tcmd"'],
    ['\rcmd', '"\'\rcmd"']
  ]

  for (const [input, expected] of risky) {
    it(`neutralizes ${JSON.stringify(input)}`, () => {
      expect(csvField(input)).toBe(expected)
    })
  }

  it('prefixes with an apostrophe AND quotes, even with no comma or newline', () => {
    const out = csvField('=cmd')
    expect(out.startsWith('"\'')).toBe(true)
    expect(out.endsWith('"')).toBe(true)
  })

  it('does not touch a risky character that is not leading', () => {
    expect(csvField('rate=95')).toBe('rate=95')
    expect(csvField('a@b')).toBe('a@b')
    expect(csvField('3 - 1')).toBe('3 - 1')
  })

  it('leaves numbers alone — a negative rate is not a formula', () => {
    expect(csvField(-1)).toBe('-1')
    expect(csvField(85)).toBe('85')
    expect(csvField(0)).toBe('0')
    expect(csvField(95.5)).toBe('95.5')
  })

  it('leaves booleans alone', () => {
    expect(csvField(true)).toBe('true')
    expect(csvField(false)).toBe('false')
  })

  it('guards a numeric-looking string that arrived as text', () => {
    // dto.resolvedRate is a number → untouched, but a string "-5" is text.
    expect(csvField('-5')).toBe('"\'-5"')
  })
})

describe('csvField — a whole row stays parseable', () => {
  it('round-trips a nasty row through a naive RFC 4180 reader', () => {
    const fields: (string | number | boolean | null)[] = [
      '2026-09-12',
      '13:00',
      '14:45',
      '1.75',
      'Intake form, "phase 2"',
      '=cmd|calc',
      'Northwind Legal\nLtd',
      null,
      'meeting, design',
      true,
      95,
      '166.25'
    ]
    const line = fields.map(csvField).join(',')

    // Minimal RFC 4180 reader — enough to prove the quoting is self-consistent.
    const out: string[] = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
        else cell += ch
      } else if (ch === '"' && cell === '') quoted = true
      else if (ch === ',') { out.push(cell); cell = '' } else cell += ch
    }
    out.push(cell)

    expect(out).toHaveLength(fields.length)
    expect(out[4]).toBe('Intake form, "phase 2"')
    expect(out[5]).toBe('\'=cmd|calc')
    expect(out[6]).toBe('Northwind Legal\nLtd')
    expect(out[7]).toBe('')
    expect(out[10]).toBe('95')
  })
})
