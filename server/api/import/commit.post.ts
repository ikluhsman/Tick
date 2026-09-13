// POST /api/import/commit — {source, csv} → transactional import.
// Matches existing clients/projects/tasks/tags by lowercase name, creates the
// missing ones, then inserts entries with the deepest ref only (Rule 1).
// Billable/rate come from the file when present, else defaults (Rule 2 resolves
// rates at read time — only an explicit file rate becomes rate_override).
import { z } from 'zod'
import type { ImportCommitResult } from '#shared/types/import'
import type { DB } from '../../utils/drizzle'
import {
  IMPORT_MAX_BYTES,
  loadExistingCatalog,
  runMapper,
  uniqueNames
} from '../../utils/import/plan'

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

const bodySchema = z.object({
  source: z.enum(['toggl', 'clockify', 'generic']),
  csv: z.string().min(1)
})

const CHUNK = 500

export default defineEventHandler(async (event): Promise<ImportCommitResult> => {
  demoGuard(event) // 403 in demo mode (preview stays open; committing writes rows)
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  if (body.csv.length > IMPORT_MAX_BYTES) {
    throw createError({ statusCode: 413, message: 'CSV exceeds the 5MB import limit' })
  }

  const { entries, warnings } = runMapper(body.source, body.csv)
  if (!entries.length) {
    throw createError({ statusCode: 400, message: 'No importable rows — every row was skipped' })
  }

  const db = useDrizzle()

  const result = await db.transaction(async (tx: Tx) => {
    const existing = await loadExistingCatalog(tx as unknown as DB, user.orgId)
    const created = { clients: 0, projects: 0, tasks: 0, tags: 0 }
    const matched = { clients: 0, projects: 0, tasks: 0, tags: 0 }

    // ── Clients ──────────────────────────────────────────────────────────
    const clientIds = new Map<string, string>() // lowercase name → id
    const clientNames = uniqueNames(entries.map(e => e.client))
    const newClients: string[] = []
    for (const name of clientNames) {
      const hit = existing.clients.get(name.toLowerCase())
      if (hit) {
        clientIds.set(name.toLowerCase(), hit.id)
        matched.clients++
      } else {
        newClients.push(name)
      }
    }
    if (newClients.length) {
      const rows = await tx
        .insert(schema.clients)
        .values(newClients.map(name => ({ orgId: user.orgId, name })))
        .returning({ id: schema.clients.id, name: schema.clients.name })
      for (const r of rows) clientIds.set(r.name.toLowerCase(), r.id)
      created.clients = rows.length
    }

    // ── Projects (client ref from the first row naming them) ─────────────
    const projectIds = new Map<string, string>()
    const projectBillable = new Map<string, boolean>()
    const projectClient = new Map<string, string | null>() // project → clientId
    for (const e of entries) {
      if (!e.project) continue
      const key = e.project.trim().toLowerCase()
      if (!projectClient.has(key)) {
        projectClient.set(key, e.client ? (clientIds.get(e.client.trim().toLowerCase()) ?? null) : null)
      }
    }
    const projectNames = uniqueNames(entries.map(e => e.project))
    const newProjects: string[] = []
    for (const name of projectNames) {
      const hit = existing.projects.get(name.toLowerCase())
      if (hit) {
        projectIds.set(name.toLowerCase(), hit.id)
        projectBillable.set(name.toLowerCase(), hit.billableDefault)
        matched.projects++
      } else {
        newProjects.push(name)
      }
    }
    if (newProjects.length) {
      const rows = await tx
        .insert(schema.projects)
        .values(newProjects.map(name => ({
          orgId: user.orgId,
          name,
          clientId: projectClient.get(name.toLowerCase()) ?? null
        })))
        .returning({ id: schema.projects.id, name: schema.projects.name })
      for (const r of rows) {
        projectIds.set(r.name.toLowerCase(), r.id)
        projectBillable.set(r.name.toLowerCase(), true)
      }
      created.projects = rows.length
    }

    // ── Tasks (project ref from the first row naming them) ───────────────
    const taskIds = new Map<string, string>()
    const taskProject = new Map<string, string | null>()
    for (const e of entries) {
      if (!e.task) continue
      const key = e.task.trim().toLowerCase()
      if (!taskProject.has(key)) {
        taskProject.set(key, e.project ? (projectIds.get(e.project.trim().toLowerCase()) ?? null) : null)
      }
    }
    const taskNames = uniqueNames(entries.map(e => e.task))
    const newTasks: string[] = []
    for (const name of taskNames) {
      const hit = existing.tasks.get(name.toLowerCase())
      if (hit) {
        taskIds.set(name.toLowerCase(), hit.id)
        matched.tasks++
      } else {
        newTasks.push(name)
      }
    }
    if (newTasks.length) {
      const rows = await tx
        .insert(schema.tasks)
        .values(newTasks.map(name => ({
          orgId: user.orgId,
          name,
          projectId: taskProject.get(name.toLowerCase()) ?? null
        })))
        .returning({ id: schema.tasks.id, name: schema.tasks.name })
      for (const r of rows) taskIds.set(r.name.toLowerCase(), r.id)
      created.tasks = rows.length
    }

    // ── Tags (org+name unique; revive trashed name matches) ──────────────
    const tagIds = new Map<string, string>()
    const tagNames = uniqueNames(entries.flatMap(e => e.tags.map(normalizeTagName)))
    if (tagNames.length) {
      const allMatches = await tx
        .select({ id: schema.tags.id, name: schema.tags.name, deletedAt: schema.tags.deletedAt })
        .from(schema.tags)
        .where(and(eq(schema.tags.orgId, user.orgId), inArray(schema.tags.name, tagNames)))
      const trashed = allMatches.filter(t => t.deletedAt !== null).map(t => t.id)
      if (trashed.length) {
        await tx.update(schema.tags).set({ deletedAt: null }).where(inArray(schema.tags.id, trashed))
      }
      for (const t of allMatches) tagIds.set(t.name, t.id)
      matched.tags = allMatches.length
      const missingTags = tagNames.filter(n => !tagIds.has(n))
      if (missingTags.length) {
        const rows = await tx
          .insert(schema.tags)
          .values(missingTags.map(name => ({ orgId: user.orgId, name })))
          .returning({ id: schema.tags.id, name: schema.tags.name })
        for (const r of rows) tagIds.set(r.name, r.id)
        created.tags = rows.length
      }
    }

    // ── Entries (deepest ref only, Rule 1) ───────────────────────────────
    const entryTagRows: { entryId: string, tagId: string }[] = []
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK)
      const values = chunk.map((e) => {
        let refType: string | null = null
        let refId: string | null = null
        if (e.task && taskIds.has(e.task.trim().toLowerCase())) {
          refType = 'task'
          refId = taskIds.get(e.task.trim().toLowerCase())!
        } else if (e.project && projectIds.has(e.project.trim().toLowerCase())) {
          refType = 'project'
          refId = projectIds.get(e.project.trim().toLowerCase())!
        } else if (e.client && clientIds.has(e.client.trim().toLowerCase())) {
          refType = 'client'
          refId = clientIds.get(e.client.trim().toLowerCase())!
        }
        const billableDefault = e.project
          ? (projectBillable.get(e.project.trim().toLowerCase()) ?? true)
          : true
        return {
          orgId: user.orgId,
          userId: user.id,
          name: e.name,
          refType,
          refId,
          billable: e.billable ?? billableDefault,
          rateOverride: e.rate,
          start: e.start,
          end: e.end
        }
      })
      const inserted = await tx
        .insert(schema.timeEntries)
        .values(values)
        .returning({ id: schema.timeEntries.id })
      inserted.forEach((row, idx) => {
        for (const raw of chunk[idx]!.tags) {
          const tagId = tagIds.get(normalizeTagName(raw))
          if (tagId) entryTagRows.push({ entryId: row.id, tagId })
        }
      })
    }
    // Dedupe (entry, tag) pairs — a row may list the same tag twice.
    const seenPair = new Set<string>()
    const uniquePairs = entryTagRows.filter((p) => {
      const key = `${p.entryId}:${p.tagId}`
      if (seenPair.has(key)) return false
      seenPair.add(key)
      return true
    })
    for (let i = 0; i < uniquePairs.length; i += CHUNK) {
      await tx.insert(schema.entryTags).values(uniquePairs.slice(i, i + CHUNK))
    }

    let from: Date | null = null
    let to: Date | null = null
    for (const e of entries) {
      if (!from || e.start < from) from = e.start
      if (!to || e.end > to) to = e.end
    }

    return {
      entries: entries.length,
      created,
      matched,
      skipped: warnings.length,
      dateRange: from && to ? { from: from.toISOString(), to: to.toISOString() } : null
    } satisfies ImportCommitResult
  })

  return result
})
