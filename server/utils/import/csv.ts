// Hand-rolled CSV parser + shared mapper types for the import feature.
// Handles: UTF-8 BOM, quoted fields, escaped quotes (""), commas/newlines
// inside quotes, CRLF/LF/CR line endings. No deps.

/** Parses CSV text into rows of string cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  // Strip BOM.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let sawAny = false // cell has content or was explicitly quoted ("")

  const pushCell = () => {
    row.push(cell)
    cell = ''
    sawAny = false
  }
  const pushRow = () => {
    pushCell()
    // Drop rows that are entirely empty (blank line).
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell === '' && !sawAny) {
      inQuotes = true
      sawAny = true
    } else if (ch === ',') {
      pushCell()
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      pushRow()
      if (text[i + 1] === '\n') i++
    } else {
      cell += ch
      sawAny = true
    }
  }
  if (cell !== '' || sawAny || row.length) pushRow()
  return rows
}

/* ------------------------------------------------- shared mapper contracts */

/** One importable entry, normalized from any source's columns. */
export interface ParsedEntry {
  /** 1-based line number in the file (header = 1) */
  line: number
  name: string
  client: string | null
  project: string | null
  task: string | null
  tags: string[]
  /** null → fall back to project.billableDefault / true */
  billable: boolean | null
  /** From the file when present → entry.rate_override; else null */
  rate: number | null
  start: Date
  end: Date
}

export interface MapperResult {
  entries: ParsedEntry[]
  warnings: { line: number, reason: string }[]
}

/** Thrown when the header row doesn't match the selected source. */
export class ImportFormatError extends Error {}

/** Case-insensitive header lookup: name → column index (-1 when absent). */
export function headerMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>()
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase()
    if (!map.has(key)) map.set(key, i)
  })
  return map
}

/** Asserts every required column is present, else throws ImportFormatError. */
export function requireColumns(map: Map<string, number>, required: string[], source: string): void {
  const missing = required.filter(c => !map.has(c.toLowerCase()))
  if (missing.length) {
    throw new ImportFormatError(
      `This doesn't look like a ${source} export — missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
    )
  }
}

export function cellAt(row: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0) return ''
  return (row[idx] ?? '').trim()
}

/** "Yes"/"No"/"true"/"false"/"1"/"0" → boolean, empty/unknown → null. */
export function parseBoolCell(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (['yes', 'true', '1', 'y'].includes(v)) return true
  if (['no', 'false', '0', 'n'].includes(v)) return false
  return null
}

/** Splits a tags cell on commas/semicolons, trims, drops empties. */
export function splitTags(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map(t => t.trim())
    .filter(Boolean)
}

/** "HH:MM:SS" | "H:MM" | decimal hours → seconds, null when unparseable. */
export function parseDurationCell(raw: string): number | null {
  const v = raw.trim()
  if (!v) return null
  const hms = v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (hms) {
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3] ?? 0)
  }
  const dec = Number(v.replace(',', '.'))
  if (Number.isFinite(dec) && dec >= 0) return Math.round(dec * 3600)
  return null
}

/**
 * Combines a date + time cell into a Date (server-local wall time).
 * Dates: YYYY-MM-DD, MM/DD/YYYY, DD.MM.YYYY. Times: HH:MM[:SS] with optional AM/PM.
 */
export function parseDateTime(dateRaw: string, timeRaw: string): Date | null {
  const date = dateRaw.trim()
  const time = timeRaw.trim()
  if (!date) return null

  let y: number, mo: number, d: number
  let m = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
  } else if ((m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    // MM/DD/YYYY (Clockify default); swap when the first part can't be a month.
    let a = Number(m[1]); let b = Number(m[2])
    if (a > 12 && b <= 12) [a, b] = [b, a]
    y = Number(m[3]); mo = a; d = b
  } else if ((m = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) {
    y = Number(m[3]); mo = Number(m[2]); d = Number(m[1])
  } else {
    return null
  }

  let hh = 0; let mm = 0; let ss = 0
  if (time) {
    const t = time.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/i)
    if (!t) return null
    hh = Number(t[1]); mm = Number(t[2]); ss = Number(t[3] ?? 0)
    const ampm = t[4]?.toLowerCase()
    if (ampm === 'pm' && hh < 12) hh += 12
    if (ampm === 'am' && hh === 12) hh = 0
  }

  const out = new Date(y, mo - 1, d, hh, mm, ss)
  if (!Number.isFinite(out.getTime())) return null
  // Reject rollovers like 2026-02-31.
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== d) return null
  if (hh > 23 || mm > 59 || ss > 59) return null
  return out
}

/** ISO datetime string → Date, null when unparseable. */
export function parseIsoCell(raw: string): Date | null {
  const v = raw.trim()
  if (!v) return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}
