// Clockify detailed-report CSV mapper.
// Columns: Project,Client,Description,Task,Tags,Billable,Start Date,Start Time,
//          End Date,End Time,Duration (h)
import {
  cellAt,
  headerMap,
  parseBoolCell,
  parseDateTime,
  parseDurationCell,
  requireColumns,
  splitTags,
  type MapperResult,
  type ParsedEntry
} from './csv'

export function mapClockify(rows: string[][], lines?: number[]): MapperResult {
  const header = headerMap(rows[0] ?? [])
  requireColumns(header, ['Description', 'Start Date', 'Start Time'], 'Clockify')

  const col = (name: string) => header.get(name.toLowerCase())
  const entries: ParsedEntry[] = []
  const warnings: MapperResult['warnings'] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    // Real source line from parseCsv when available, else the row index
    // (only hand-built test rows without blank lines/quoted newlines lack it).
    const line = lines ? lines[i]! : i + 1
    const start = parseDateTime(cellAt(row, col('Start Date')), cellAt(row, col('Start Time')))
    if (!start) {
      warnings.push({ line, reason: `Unparseable start date/time "${cellAt(row, col('Start Date'))} ${cellAt(row, col('Start Time'))}"` })
      continue
    }

    let end = parseDateTime(cellAt(row, col('End Date')), cellAt(row, col('End Time')))
    if (!end) {
      // "Duration (h)" is either HH:MM:SS or decimal hours.
      const durSec = parseDurationCell(cellAt(row, col('Duration (h)')))
      if (durSec != null && durSec > 0) end = new Date(start.getTime() + durSec * 1000)
    }
    if (!end) {
      warnings.push({ line, reason: 'Missing or unparseable end date/time (and no usable Duration (h))' })
      continue
    }
    if (end.getTime() <= start.getTime()) {
      warnings.push({ line, reason: 'Zero-length or negative duration (end ≤ start)' })
      continue
    }

    entries.push({
      line,
      name: cellAt(row, col('Description')),
      client: cellAt(row, col('Client')) || null,
      project: cellAt(row, col('Project')) || null,
      task: cellAt(row, col('Task')) || null,
      tags: splitTags(cellAt(row, col('Tags'))),
      billable: parseBoolCell(cellAt(row, col('Billable'))),
      rate: null,
      start,
      end
    })
  }
  return { entries, warnings }
}
