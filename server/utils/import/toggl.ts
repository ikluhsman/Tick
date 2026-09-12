// Toggl Track detailed-report CSV mapper.
// Columns: Email,Client,Project,Task,Description,Billable,Start date,Start time,
//          End date,End time,Duration,Tags
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

export function mapToggl(rows: string[][]): MapperResult {
  const header = headerMap(rows[0] ?? [])
  requireColumns(header, ['Description', 'Start date', 'Start time'], 'Toggl')

  const col = (name: string) => header.get(name.toLowerCase())
  const entries: ParsedEntry[] = []
  const warnings: MapperResult['warnings'] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    const line = i + 1
    const start = parseDateTime(cellAt(row, col('Start date')), cellAt(row, col('Start time')))
    if (!start) {
      warnings.push({ line, reason: `Unparseable start date/time "${cellAt(row, col('Start date'))} ${cellAt(row, col('Start time'))}"` })
      continue
    }

    let end = parseDateTime(cellAt(row, col('End date')), cellAt(row, col('End time')))
    if (!end) {
      // Fall back to Duration (HH:MM:SS) when the end cells are missing/bad.
      const durSec = parseDurationCell(cellAt(row, col('Duration')))
      if (durSec != null && durSec > 0) end = new Date(start.getTime() + durSec * 1000)
    }
    if (!end) {
      warnings.push({ line, reason: 'Missing or unparseable end date/time (and no usable Duration)' })
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
