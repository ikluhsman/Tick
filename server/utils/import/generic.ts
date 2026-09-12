// Generic CSV mapper. Documented header (UI hint):
//   name,start,end,client,project,task,tags,billable[,rate]
// start/end are ISO datetimes; tags comma- or semicolon-separated.
import {
  cellAt,
  headerMap,
  parseBoolCell,
  parseIsoCell,
  requireColumns,
  splitTags,
  type MapperResult,
  type ParsedEntry
} from './csv'

export function mapGeneric(rows: string[][]): MapperResult {
  const header = headerMap(rows[0] ?? [])
  requireColumns(header, ['start', 'end'], 'generic CSV')

  const col = (name: string) => header.get(name)
  const entries: ParsedEntry[] = []
  const warnings: MapperResult['warnings'] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    const line = i + 1
    const start = parseIsoCell(cellAt(row, col('start')))
    if (!start) {
      warnings.push({ line, reason: `Unparseable ISO start "${cellAt(row, col('start'))}"` })
      continue
    }
    const end = parseIsoCell(cellAt(row, col('end')))
    if (!end) {
      warnings.push({ line, reason: `Unparseable ISO end "${cellAt(row, col('end'))}"` })
      continue
    }
    if (end.getTime() <= start.getTime()) {
      warnings.push({ line, reason: 'Zero-length or negative duration (end ≤ start)' })
      continue
    }

    const rateRaw = cellAt(row, col('rate'))
    const rate = rateRaw ? Number(rateRaw.replace(/[$,]/g, '')) : null

    entries.push({
      line,
      name: cellAt(row, col('name')),
      client: cellAt(row, col('client')) || null,
      project: cellAt(row, col('project')) || null,
      task: cellAt(row, col('task')) || null,
      tags: splitTags(cellAt(row, col('tags'))),
      billable: parseBoolCell(cellAt(row, col('billable'))),
      rate: rate != null && Number.isFinite(rate) && rate >= 0 ? rate : null,
      start,
      end
    })
  }
  return { entries, warnings }
}
