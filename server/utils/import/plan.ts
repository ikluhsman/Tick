// Import dry-run planning, shared by /api/import/preview and /api/import/commit.
// Matching rule: existing catalog rows are matched by lowercase name (org-scoped,
// non-trashed); anything unmatched would be created.
import type { ImportPreview, ImportSource } from '#shared/types/import'
import { and, eq, isNull, schema, type DB } from '../drizzle'
import { normalizeTagName } from '../entry-dto'
import { ImportFormatError, parseCsv, type MapperResult } from './csv'
import { mapClockify } from './clockify'
import { mapGeneric } from './generic'
import { mapToggl } from './toggl'

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024

/** Parses + maps a CSV for the given source. Throws 400 on format mismatch. */
export function runMapper(source: ImportSource, csv: string): MapperResult {
  const { rows, lines } = parseCsv(csv)
  if (rows.length < 2) {
    throw createError({ statusCode: 400, message: 'CSV has no data rows (header + at least one row required)' })
  }
  try {
    if (source === 'toggl') return mapToggl(rows, lines)
    if (source === 'clockify') return mapClockify(rows, lines)
    return mapGeneric(rows, lines)
  } catch (err) {
    if (err instanceof ImportFormatError) {
      throw createError({ statusCode: 400, message: err.message })
    }
    throw err
  }
}

export interface ExistingCatalog {
  /** lowercase name → row */
  clients: Map<string, { id: string }>
  projects: Map<string, { id: string, billableDefault: boolean }>
  tasks: Map<string, { id: string }>
  tags: Map<string, { id: string }>
}

/** Loads the org's live catalog keyed by lowercase name (first row wins on dupes). */
export async function loadExistingCatalog(db: DB, orgId: string): Promise<ExistingCatalog> {
  const [clientRows, projectRows, taskRows, tagRows] = await Promise.all([
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients)
      .where(and(eq(schema.clients.orgId, orgId), isNull(schema.clients.deletedAt))),
    db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        billableDefault: schema.projects.billableDefault
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.orgId, orgId), isNull(schema.projects.deletedAt))),
    db
      .select({ id: schema.tasks.id, name: schema.tasks.name })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.orgId, orgId), isNull(schema.tasks.deletedAt))),
    db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(and(eq(schema.tags.orgId, orgId), isNull(schema.tags.deletedAt)))
  ])

  const byName = <T extends { name: string }>(rows: T[]) => {
    const map = new Map<string, T>()
    for (const r of rows) {
      const key = r.name.trim().toLowerCase()
      if (!map.has(key)) map.set(key, r)
    }
    return map
  }
  return {
    clients: byName(clientRows),
    projects: byName(projectRows),
    tasks: byName(taskRows),
    tags: byName(tagRows)
  }
}

/** Unique names in first-seen order (case-insensitive dedupe, original casing kept). */
export function uniqueNames(names: (string | null)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    if (!n) continue
    const key = n.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(n.trim())
  }
  return out
}

/** Builds the dry-run preview DTO from a mapper result + existing catalog. */
export function buildPreview(
  source: ImportSource,
  result: MapperResult,
  existing: ExistingCatalog
): ImportPreview {
  const { entries, warnings } = result

  const mark = (names: string[], map: Map<string, unknown>) =>
    names.map(name => ({ name, existing: map.has(name.toLowerCase()) }))

  const tagNames = uniqueNames(entries.flatMap(e => e.tags.map(normalizeTagName)))

  let from: Date | null = null
  let to: Date | null = null
  for (const e of entries) {
    if (!from || e.start < from) from = e.start
    if (!to || e.end > to) to = e.end
  }

  return {
    source,
    entryCount: entries.length,
    dateRange: from && to ? { from: from.toISOString(), to: to.toISOString() } : null,
    clients: mark(uniqueNames(entries.map(e => e.client)), existing.clients),
    projects: mark(uniqueNames(entries.map(e => e.project)), existing.projects),
    tasks: mark(uniqueNames(entries.map(e => e.task)), existing.tasks),
    tags: mark(tagNames, existing.tags),
    rows: entries.slice(0, 10).map(e => ({
      name: e.name,
      client: e.client,
      project: e.project,
      task: e.task,
      tags: e.tags,
      billable:
        e.billable
        ?? (e.project ? (existing.projects.get(e.project.toLowerCase())?.billableDefault ?? true) : true),
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      durationSec: Math.round((e.end.getTime() - e.start.getTime()) / 1000)
    })),
    warnings
  }
}
