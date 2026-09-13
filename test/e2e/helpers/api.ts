// Thin wrappers over the JSON API (CONTRACTS.md "API surface") used for test
// setup and, above all, cleanup: every spec deletes what it created through
// these so a re-run starts from the same fixture.
import { expect, type APIRequestContext } from '@playwright/test'
import type { DeleteResult, EntryDto } from '../../../shared/types'

/** Local midnight today → local midnight tomorrow, as ISO strings. */
export function todayRange(): { from: string, to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(from.getTime() + 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** Local midnight `daysAgo` days back → the day after, as ISO strings. */
export function dayRange(daysAgo: number): { from: string, to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
  const to = new Date(from.getTime() + 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** The window the Time page loads: 30 days back through tomorrow. */
export function pageRange(): { from: string, to: string } {
  const now = new Date()
  return {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  }
}

export async function listEntries(
  request: APIRequestContext,
  range: { from: string, to: string } = pageRange()
): Promise<EntryDto[]> {
  const res = await request.get('/api/entries', { params: range })
  expect(res.ok(), `GET /api/entries → ${res.status()}`).toBe(true)
  return res.json() as Promise<EntryDto[]>
}

export interface NewEntry {
  name: string
  refType?: 'client' | 'project' | 'task'
  refId?: string
  billable?: boolean
  start: string
  end: string
  tags?: string[]
}

export async function createEntry(request: APIRequestContext, body: NewEntry): Promise<EntryDto> {
  const res = await request.post('/api/entries', { data: body })
  expect(res.ok(), `POST /api/entries → ${res.status()}`).toBe(true)
  return res.json() as Promise<EntryDto>
}

/**
 * Soft-deletes an entry and hands back the DeleteResult (feed it to
 * restoreDeleted to put the row back). A row that is already gone is not an
 * error — cleanup runs even when a test failed halfway.
 */
export async function deleteEntry(request: APIRequestContext, id: string): Promise<DeleteResult | null> {
  const res = await request.delete(`/api/entries/${id}`)
  if (!res.ok()) {
    if (res.status() === 404) return null
    throw new Error(`DELETE /api/entries/${id} → ${res.status()}`)
  }
  return res.json() as Promise<DeleteResult>
}

/** Deletes every entry in the loaded window whose name matches — the cleanup workhorse. */
export async function deleteEntriesNamed(request: APIRequestContext, ...names: string[]): Promise<void> {
  const wanted = new Set(names)
  for (const e of await listEntries(request)) {
    if (wanted.has(e.name)) await deleteEntry(request, e.id)
  }
}

export async function restoreDeleted(request: APIRequestContext, result: DeleteResult): Promise<void> {
  const res = await request.post('/api/restore', { data: { deleted: result.deleted } })
  expect(res.ok(), `POST /api/restore → ${res.status()}`).toBe(true)
}

/**
 * Stops a running timer if there is one and removes the entry it produced.
 * Every spec that starts a timer calls this in afterEach — a leaked running
 * timer would make the next spec's start() 409.
 */
export async function clearRunningTimer(request: APIRequestContext): Promise<void> {
  const state = await request.get('/api/timer')
  if (!state.ok()) return
  const body = await state.text()
  if (!body || body === 'null') return
  const stopped = await request.post('/api/timer/stop')
  if (!stopped.ok()) return
  const text = await stopped.text()
  if (!text || text === 'null') return
  const dto = JSON.parse(text) as EntryDto
  await deleteEntry(request, dto.id)
}

/** Catalog lookup by name, e.g. the project a spec wants to attach. */
export async function findProject(request: APIRequestContext, name: string): Promise<{ id: string }> {
  const res = await request.get('/api/projects')
  expect(res.ok(), `GET /api/projects → ${res.status()}`).toBe(true)
  const projects = (await res.json()) as { id: string, name: string }[]
  const hit = projects.find(p => p.name === name)
  if (!hit) throw new Error(`seed project "${name}" not found`)
  return hit
}

/** Creates a standalone open task — e.g. to push the picker's task list past one screen. */
export async function createTask(request: APIRequestContext, name: string): Promise<{ id: string, name: string }> {
  const res = await request.post('/api/tasks', { data: { name } })
  expect(res.ok(), `POST /api/tasks → ${res.status()}`).toBe(true)
  return res.json() as Promise<{ id: string, name: string }>
}

/** Deletes every task whose name matches — cleanup for specs that create tasks through the UI. */
export async function deleteTasksNamed(request: APIRequestContext, ...names: string[]): Promise<void> {
  const wanted = new Set(names)
  const res = await request.get('/api/tasks')
  if (!res.ok()) return
  const tasks = (await res.json()) as { id: string, name: string }[]
  for (const t of tasks) {
    if (wanted.has(t.name)) await request.delete(`/api/tasks/${t.id}`)
  }
}
