// server/utils/import/* — the hand-rolled CSV parser, the shared cell helpers,
// and the three source mappers (Toggl, Clockify, generic).
//
// All pure: rows in, ParsedEntry/warnings out. The contract that matters is
// "a bad row produces a warning and is skipped, never a throw" — only a header
// mismatch throws (ImportFormatError), because that means the wrong source was
// picked for the file.
import { describe, expect, it } from 'vitest'
import {
  ImportFormatError,
  cellAt,
  headerMap,
  parseBoolCell,
  parseCsv,
  parseDateTime,
  parseDurationCell,
  parseIsoCell,
  requireColumns,
  splitTags
} from '../../server/utils/import/csv'
import { mapClockify } from '../../server/utils/import/clockify'
import { mapGeneric } from '../../server/utils/import/generic'
import { mapToggl } from '../../server/utils/import/toggl'
import { toCsv } from '../helpers/factories'

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual({
      rows: [
        ['a', 'b', 'c'],
        ['1', '2', '3']
      ],
      lines: [1, 2]
    })
  })

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual({ rows: [], lines: [] })
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,"b,c",d')).toEqual({ rows: [['a', 'b,c', 'd']], lines: [1] })
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"he said ""hi""",x')).toEqual({ rows: [['he said "hi"', 'x']], lines: [1] })
  })

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2",b')).toEqual({ rows: [['a', 'line1\nline2', 'b']], lines: [1] })
  })

  it('keeps CRLF inside quoted fields', () => {
    expect(parseCsv('a,"line1\r\nline2"')).toEqual({ rows: [['a', 'line1\r\nline2']], lines: [1] })
  })

  it('tracks the real starting line after a multi-line quoted field', () => {
    // Row 1 spans source lines 1-2 (the quoted field swallows one newline);
    // row 2 therefore starts at line 3, not at "row index + 1" (= 2).
    expect(parseCsv('a,"line1\nline2",b\nc,d,e')).toEqual({
      rows: [
        ['a', 'line1\nline2', 'b'],
        ['c', 'd', 'e']
      ],
      lines: [1, 3]
    })
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2']
      ],
      lines: [1, 2]
    })
  })

  it('handles bare CR line endings', () => {
    expect(parseCsv('a,b\r1,2')).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2']
      ],
      lines: [1, 2]
    })
  })

  it('does not add a phantom row for a trailing LF newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2']
      ],
      lines: [1, 2]
    })
  })

  it('drops a blank line at the very end without adding a phantom row', () => {
    expect(parseCsv('a,b\n1,2\n\n')).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2']
      ],
      lines: [1, 2]
    })
  })

  it('strips a UTF-8 BOM from the first header cell', () => {
    const { rows } = parseCsv('\uFEFFDescription,Start date\nWork,2026-09-12')
    expect(rows[0]![0]).toBe('Description')
  })

  it('drops blank lines but keeps a row of empty cells, and advances the line count past them', () => {
    expect(parseCsv('a,b\n\n\n1,2\n')).toEqual({
      rows: [
        ['a', 'b'],
        ['1', '2']
      ],
      // Two blank lines (2, 3) sit between the header and the data row, so
      // the data row starts at line 4 \u2014 not at "row index + 1" (= 2).
      lines: [1, 4]
    })
    expect(parseCsv(',,')).toEqual({ rows: [['', '', '']], lines: [1] })
  })

  it('preserves ragged rows as-is (short and long)', () => {
    expect(parseCsv('a,b,c\n1\n1,2,3,4')).toEqual({
      rows: [
        ['a', 'b', 'c'],
        ['1'],
        ['1', '2', '3', '4']
      ],
      lines: [1, 2, 3]
    })
  })

  it('keeps a trailing empty field', () => {
    expect(parseCsv('a,b,')).toEqual({ rows: [['a', 'b', '']], lines: [1] })
  })

  it('parses the final row when the file has no trailing newline', () => {
    expect(parseCsv('a\n b')).toEqual({ rows: [['a'], [' b']], lines: [1, 2] })
  })

  it('treats a quote that is not at the start of a field as literal text', () => {
    expect(parseCsv('a"b,c')).toEqual({ rows: [['a"b', 'c']], lines: [1] })
  })

  it('does not lose data on an unterminated quote', () => {
    expect(parseCsv('a,"b,c')).toEqual({ rows: [['a', 'b,c']], lines: [1] })
  })
})

describe('cell helpers', () => {
  it('headerMap lowercases, trims, and keeps the first of a duplicate', () => {
    const m = headerMap([' Description ', 'Start Date', 'description'])
    expect(m.get('description')).toBe(0)
    expect(m.get('start date')).toBe(1)
    expect(m.get('missing')).toBeUndefined()
  })

  it('requireColumns passes when every column is present (case-insensitively)', () => {
    const m = headerMap(['description', 'START DATE'])
    expect(() => requireColumns(m, ['Description', 'Start date'], 'Toggl')).not.toThrow()
  })

  it('requireColumns throws ImportFormatError naming the missing columns', () => {
    const m = headerMap(['description'])
    expect(() => requireColumns(m, ['Description', 'Start date', 'Start time'], 'Toggl')).toThrow(
      ImportFormatError
    )
    try {
      requireColumns(m, ['Description', 'Start date', 'Start time'], 'Toggl')
    } catch (e) {
      expect((e as Error).message).toContain('Toggl')
      expect((e as Error).message).toContain('Start date, Start time')
      expect((e as Error).message).toContain('columns')
    }
  })

  it('cellAt trims, and returns "" for a missing index or short row', () => {
    expect(cellAt([' a ', 'b'], 0)).toBe('a')
    expect(cellAt(['a'], 5)).toBe('')
    expect(cellAt(['a'], -1)).toBe('')
    expect(cellAt(['a'], undefined)).toBe('')
  })

  it('parseBoolCell maps the usual spellings, null for unknown/empty', () => {
    for (const v of ['Yes', 'yes', 'TRUE', '1', 'y']) expect(parseBoolCell(v)).toBe(true)
    for (const v of ['No', 'false', '0', 'N']) expect(parseBoolCell(v)).toBe(false)
    for (const v of ['', '   ', 'maybe', '2']) expect(parseBoolCell(v)).toBeNull()
  })

  it('splitTags splits on commas and semicolons, trimming and dropping empties', () => {
    expect(splitTags(' design , dev ;; meeting,')).toEqual(['design', 'dev', 'meeting'])
    expect(splitTags('')).toEqual([])
  })

  it('parseDurationCell handles HH:MM:SS, H:MM and decimal hours', () => {
    expect(parseDurationCell('01:30:45')).toBe(5445)
    expect(parseDurationCell('1:30')).toBe(5400)
    expect(parseDurationCell('2.5')).toBe(9000)
    expect(parseDurationCell('2,5')).toBe(9000)
    expect(parseDurationCell('0')).toBe(0)
    expect(parseDurationCell('')).toBeNull()
    expect(parseDurationCell('an hour')).toBeNull()
    expect(parseDurationCell('-1')).toBeNull()
  })

  it('parseIsoCell parses an ISO string and rejects junk', () => {
    expect(parseIsoCell('2026-09-12T13:00:00Z')!.toISOString()).toBe('2026-09-12T13:00:00.000Z')
    expect(parseIsoCell('')).toBeNull()
    expect(parseIsoCell('not a date')).toBeNull()
  })
})

describe('parseDateTime', () => {
  const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
    new Date(y, mo - 1, d, h, mi, s).getTime()

  it('parses YYYY-MM-DD with HH:MM', () => {
    expect(parseDateTime('2026-09-12', '13:05')!.getTime()).toBe(local(2026, 9, 12, 13, 5))
  })

  it('parses HH:MM:SS', () => {
    expect(parseDateTime('2026-09-12', '13:05:30')!.getTime()).toBe(local(2026, 9, 12, 13, 5, 30))
  })

  it('parses MM/DD/YYYY (Clockify default)', () => {
    expect(parseDateTime('09/12/2026', '00:00')!.getTime()).toBe(local(2026, 9, 12))
  })

  it('swaps MM/DD when the first part cannot be a month', () => {
    expect(parseDateTime('13/09/2026', '')!.getTime()).toBe(local(2026, 9, 13))
  })

  it('parses DD.MM.YYYY', () => {
    expect(parseDateTime('12.09.2026', '')!.getTime()).toBe(local(2026, 9, 12))
  })

  it('applies AM/PM', () => {
    expect(parseDateTime('2026-09-12', '1:05 PM')!.getTime()).toBe(local(2026, 9, 12, 13, 5))
    expect(parseDateTime('2026-09-12', '12:30 am')!.getTime()).toBe(local(2026, 9, 12, 0, 30))
    expect(parseDateTime('2026-09-12', '12:30 pm')!.getTime()).toBe(local(2026, 9, 12, 12, 30))
  })

  it('defaults to midnight when the time cell is empty', () => {
    expect(parseDateTime('2026-09-12', '')!.getTime()).toBe(local(2026, 9, 12))
  })

  it('returns null for an empty or unrecognised date', () => {
    expect(parseDateTime('', '13:00')).toBeNull()
    expect(parseDateTime('12 Sept 2026', '13:00')).toBeNull()
    expect(parseDateTime('2026/09/12', '13:00')).toBeNull()
  })

  it('returns null for an unrecognised time', () => {
    expect(parseDateTime('2026-09-12', '1pm')).toBeNull()
    expect(parseDateTime('2026-09-12', 'noon')).toBeNull()
  })

  it('rejects calendar rollovers instead of silently shifting the day', () => {
    expect(parseDateTime('2026-02-31', '')).toBeNull()
    expect(parseDateTime('2026-13-01', '')).toBeNull()
    expect(parseDateTime('2026-02-29', '')).toBeNull() // 2026 is not a leap year
    expect(parseDateTime('2024-02-29', '')).not.toBeNull() // 2024 is
  })

  it('rejects out-of-range clock parts', () => {
    expect(parseDateTime('2026-09-12', '25:00')).toBeNull()
    expect(parseDateTime('2026-09-12', '10:75')).toBeNull()
  })
})

/* ------------------------------------------------------------- the mappers */

const TOGGL_HEADER = [
  'Email', 'Client', 'Project', 'Task', 'Description', 'Billable',
  'Start date', 'Start time', 'End date', 'End time', 'Duration', 'Tags'
]

function togglRow(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Email': 'mara@example.com',
    'Client': 'Northwind Legal',
    'Project': 'Intake form',
    'Task': 'Validation',
    'Description': 'Intake form validation',
    'Billable': 'Yes',
    'Start date': '2026-09-12',
    'Start time': '13:00:00',
    'End date': '2026-09-12',
    'End time': '14:45:00',
    'Duration': '01:45:00',
    'Tags': 'design, dev',
    ...over
  }
  return TOGGL_HEADER.map(h => base[h] ?? '')
}

describe('mapToggl', () => {
  it('maps a good row onto a ParsedEntry', () => {
    const { entries, warnings } = mapToggl([TOGGL_HEADER, togglRow()])
    expect(warnings).toEqual([])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      line: 2,
      name: 'Intake form validation',
      client: 'Northwind Legal',
      project: 'Intake form',
      task: 'Validation',
      tags: ['design', 'dev'],
      billable: true,
      rate: null
    })
    expect(entries[0]!.start.getTime()).toBe(new Date(2026, 8, 12, 13, 0, 0).getTime())
    expect(entries[0]!.end.getTime()).toBe(new Date(2026, 8, 12, 14, 45, 0).getTime())
  })

  it('nulls empty client/project/task cells rather than storing ""', () => {
    const { entries } = mapToggl([
      TOGGL_HEADER,
      togglRow({ Client: '', Project: '', Task: '', Tags: '' })
    ])
    expect(entries[0]).toMatchObject({ client: null, project: null, task: null, tags: [] })
  })

  it('leaves billable null when the cell is blank (project default applies later)', () => {
    const { entries } = mapToggl([TOGGL_HEADER, togglRow({ Billable: '' })])
    expect(entries[0]!.billable).toBeNull()
  })

  it('falls back to Duration when the end cells are unusable', () => {
    const { entries, warnings } = mapToggl([
      TOGGL_HEADER,
      togglRow({ 'End date': '', 'End time': '', 'Duration': '01:45:00' })
    ])
    expect(warnings).toEqual([])
    expect(entries[0]!.end.getTime() - entries[0]!.start.getTime()).toBe(105 * 60 * 1000)
  })

  it('warns and skips a bad start date — it never throws', () => {
    const rows = [TOGGL_HEADER, togglRow({ 'Start date': 'yesterday' }), togglRow()]
    let result!: ReturnType<typeof mapToggl>
    expect(() => { result = mapToggl(rows) }).not.toThrow()
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.line).toBe(3)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.line).toBe(2)
    expect(result.warnings[0]!.reason).toMatch(/start date\/time/i)
  })

  it('warns and skips when there is no usable end and no duration', () => {
    const { entries, warnings } = mapToggl([
      TOGGL_HEADER,
      togglRow({ 'End date': 'nope', 'End time': '', 'Duration': '' })
    ])
    expect(entries).toEqual([])
    expect(warnings[0]!.reason).toMatch(/end date\/time/i)
  })

  it('warns and skips a zero-length or negative row', () => {
    const zero = mapToggl([TOGGL_HEADER, togglRow({ 'End time': '13:00:00', 'Duration': '' })])
    expect(zero.entries).toEqual([])
    expect(zero.warnings[0]!.reason).toMatch(/end ≤ start/)

    const negative = mapToggl([TOGGL_HEADER, togglRow({ 'End time': '12:00:00', 'Duration': '' })])
    expect(negative.entries).toEqual([])
    expect(negative.warnings).toHaveLength(1)
  })

  it('tolerates a ragged short row by warning instead of crashing', () => {
    const { entries, warnings } = mapToggl([TOGGL_HEADER, ['mara@example.com']])
    expect(entries).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it('throws ImportFormatError when the header is not a Toggl export', () => {
    expect(() => mapToggl([['name', 'start', 'end']])).toThrow(ImportFormatError)
    expect(() => mapToggl([])).toThrow(ImportFormatError)
  })

  it('accepts a header in any letter case', () => {
    const header = TOGGL_HEADER.map(h => h.toUpperCase())
    const { entries, warnings } = mapToggl([header, togglRow()])
    expect(warnings).toEqual([])
    expect(entries[0]!.name).toBe('Intake form validation')
  })

  it('reads from real CSV text, quoted fields and all', () => {
    const text = toCsv([TOGGL_HEADER, togglRow({ Description: 'Intake, "phase 2"' })], '\r\n')
    const { rows, lines } = parseCsv(text)
    const { entries, warnings } = mapToggl(rows, lines)
    expect(warnings).toEqual([])
    expect(entries[0]!.name).toBe('Intake, "phase 2"')
  })

  it('reports a warning at the row\'s real line after a blank line and a multi-line quoted field', () => {
    const text = toCsv([
      TOGGL_HEADER,
      [],
      togglRow({ Description: 'Intake\nform, phase 2' }),
      togglRow({ 'Start date': 'yesterday' })
    ])
    // Explicit line count: header=1, blank line=2, the multi-line quoted
    // Description spans lines 3-4, so the bad row starts at line 5 — not
    // at "row index + 1" (= 3).
    const badRowLine = 5
    const { rows, lines } = parseCsv(text)
    const { entries, warnings } = mapToggl(rows, lines)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.line).toBe(3)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.line).toBe(badRowLine)
    expect(warnings[0]!.reason).toMatch(/start date\/time/i)
  })
})

const CLOCKIFY_HEADER = [
  'Project', 'Client', 'Description', 'Task', 'Tags', 'Billable',
  'Start Date', 'Start Time', 'End Date', 'End Time', 'Duration (h)'
]

function clockifyRow(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Project': 'Website redesign',
    'Client': 'Acme Co',
    'Description': 'Hero layout pass',
    'Task': 'Homepage hero',
    'Tags': 'design;dev',
    'Billable': 'No',
    'Start Date': '09/12/2026',
    'Start Time': '09:05 AM',
    'End Date': '09/12/2026',
    'End Time': '11:20 AM',
    'Duration (h)': '2.25',
    ...over
  }
  return CLOCKIFY_HEADER.map(h => base[h] ?? '')
}

describe('mapClockify', () => {
  it('maps a good row, MM/DD/YYYY + AM/PM and all', () => {
    const { entries, warnings } = mapClockify([CLOCKIFY_HEADER, clockifyRow()])
    expect(warnings).toEqual([])
    expect(entries[0]).toMatchObject({
      line: 2,
      name: 'Hero layout pass',
      client: 'Acme Co',
      project: 'Website redesign',
      task: 'Homepage hero',
      tags: ['design', 'dev'],
      billable: false,
      rate: null
    })
    expect(entries[0]!.start.getTime()).toBe(new Date(2026, 8, 12, 9, 5).getTime())
    expect(entries[0]!.end.getTime()).toBe(new Date(2026, 8, 12, 11, 20).getTime())
  })

  it('falls back to decimal "Duration (h)" when the end cells are unusable', () => {
    const { entries, warnings } = mapClockify([
      CLOCKIFY_HEADER,
      clockifyRow({ 'End Date': '', 'End Time': '', 'Duration (h)': '2.25' })
    ])
    expect(warnings).toEqual([])
    expect(entries[0]!.end.getTime() - entries[0]!.start.getTime()).toBe(2.25 * 3600 * 1000)
  })

  it('warns and skips a bad date instead of throwing', () => {
    const rows = [CLOCKIFY_HEADER, clockifyRow({ 'Start Date': '02/31/2026' }), clockifyRow()]
    let result!: ReturnType<typeof mapClockify>
    expect(() => { result = mapClockify(rows) }).not.toThrow()
    expect(result.entries).toHaveLength(1)
    expect(result.warnings).toEqual([
      { line: 2, reason: 'Unparseable start date/time "02/31/2026 09:05 AM"' }
    ])
  })

  it('throws ImportFormatError on a Toggl file picked as Clockify', () => {
    expect(() => mapClockify([TOGGL_HEADER.filter(h => h !== 'Description')])).toThrow(
      ImportFormatError
    )
  })

  it('reports a warning at the row\'s real line after a blank line and a multi-line quoted field', () => {
    const text = toCsv([
      CLOCKIFY_HEADER,
      [],
      clockifyRow({ Description: 'Hero\nlayout, pass' }),
      clockifyRow({ 'Start Date': '02/31/2026' })
    ])
    // Explicit line count: header=1, blank line=2, the multi-line quoted
    // Description spans lines 3-4, so the bad row starts at line 5 — not
    // at "row index + 1" (= 3).
    const badRowLine = 5
    const { rows, lines } = parseCsv(text)
    const { entries, warnings } = mapClockify(rows, lines)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.line).toBe(3)
    expect(warnings).toEqual([
      { line: badRowLine, reason: 'Unparseable start date/time "02/31/2026 09:05 AM"' }
    ])
  })
})

const GENERIC_HEADER = ['name', 'start', 'end', 'client', 'project', 'task', 'tags', 'billable', 'rate']

function genericRow(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    name: 'Standup + planning',
    start: '2026-09-12T09:00:00.000Z',
    end: '2026-09-12T09:30:00.000Z',
    client: 'Playtone',
    project: 'Ops',
    task: '',
    tags: 'meeting',
    billable: 'false',
    rate: '120',
    ...over
  }
  return GENERIC_HEADER.map(h => base[h] ?? '')
}

describe('mapGeneric', () => {
  it('maps a good row from ISO datetimes', () => {
    const { entries, warnings } = mapGeneric([GENERIC_HEADER, genericRow()])
    expect(warnings).toEqual([])
    expect(entries[0]).toMatchObject({
      line: 2,
      name: 'Standup + planning',
      client: 'Playtone',
      project: 'Ops',
      task: null,
      tags: ['meeting'],
      billable: false,
      rate: 120
    })
    expect(entries[0]!.start.toISOString()).toBe('2026-09-12T09:00:00.000Z')
    expect(entries[0]!.end.toISOString()).toBe('2026-09-12T09:30:00.000Z')
  })

  it('strips $ and thousands separators from the rate cell', () => {
    const { entries } = mapGeneric([GENERIC_HEADER, genericRow({ rate: '$1,250.50' })])
    expect(entries[0]!.rate).toBe(1250.5)
  })

  it('drops an unparseable or negative rate rather than failing the row', () => {
    expect(mapGeneric([GENERIC_HEADER, genericRow({ rate: 'free' })]).entries[0]!.rate).toBeNull()
    expect(mapGeneric([GENERIC_HEADER, genericRow({ rate: '-5' })]).entries[0]!.rate).toBeNull()
    expect(mapGeneric([GENERIC_HEADER, genericRow({ rate: '' })]).entries[0]!.rate).toBeNull()
  })

  it('warns and skips a bad start, a bad end, and a non-positive duration', () => {
    const rows = [
      GENERIC_HEADER,
      genericRow({ start: 'tomorrow' }),
      genericRow({ end: '' }),
      genericRow({ end: '2026-09-12T09:00:00.000Z' }),
      genericRow()
    ]
    let result!: ReturnType<typeof mapGeneric>
    expect(() => { result = mapGeneric(rows) }).not.toThrow()
    expect(result.entries.map(e => e.line)).toEqual([5])
    expect(result.warnings.map(w => w.line)).toEqual([2, 3, 4])
    expect(result.warnings[0]!.reason).toMatch(/ISO start/)
    expect(result.warnings[1]!.reason).toMatch(/ISO end/)
    expect(result.warnings[2]!.reason).toMatch(/end ≤ start/)
  })

  it('works with only the two required columns present', () => {
    const header = ['start', 'end']
    const { entries, warnings } = mapGeneric([
      header,
      ['2026-09-12T09:00:00.000Z', '2026-09-12T10:00:00.000Z']
    ])
    expect(warnings).toEqual([])
    expect(entries[0]).toMatchObject({ name: '', client: null, project: null, tags: [], rate: null })
  })

  it('throws ImportFormatError when start/end are missing', () => {
    expect(() => mapGeneric([['name', 'client']])).toThrow(ImportFormatError)
  })

  it('reads a BOM-prefixed CRLF file end to end', () => {
    const text = '\uFEFF' + toCsv([GENERIC_HEADER, genericRow()], '\r\n') + '\r\n'
    const { rows, lines } = parseCsv(text)
    const { entries, warnings } = mapGeneric(rows, lines)
    expect(warnings).toEqual([])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('Standup + planning')
  })

  it('reports a warning at the row\'s real line after a blank line and a multi-line quoted field', () => {
    const text = toCsv([
      GENERIC_HEADER,
      [],
      genericRow({ name: 'Standup\nplanning, sync' }),
      genericRow({ start: 'tomorrow' })
    ])
    // Explicit line count: header=1, blank line=2, the multi-line quoted
    // name spans lines 3-4, so the bad row starts at line 5 \u2014 not at
    // "row index + 1" (= 3).
    const badRowLine = 5
    const { rows, lines } = parseCsv(text)
    const { entries, warnings } = mapGeneric(rows, lines)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.line).toBe(3)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.line).toBe(badRowLine)
    expect(warnings[0]!.reason).toMatch(/ISO start/)
  })
})
