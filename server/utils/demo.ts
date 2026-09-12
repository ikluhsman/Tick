// Demo/seed dataset for Tick — one implementation shared by the tsx CLI
// (`npm run db:seed` → server/db/seed.ts thin wrapper) and the demo-mode
// reset plugin (server/plugins/demo-reset.ts). Deliberately framework-free:
// explicit imports only, no nitro auto-imports, so tsx can run it raw.
//
// resetDemoData() is idempotent: wipes the "Hollow Studio" org + demo user,
// then reseeds ~3 weeks of entries (deterministic rng; the today rows match
// the screenshots). Leaves NO running entry — every row has an end.
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../db/schema'
import { hashPassword } from './password'

const ORG_NAME = 'Hollow Studio'
const USER_EMAIL = 'mara@example.com'

/** Deterministic rng so reseeds produce the same shape of history. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoResetCounts {
  tasks: number
  tags: number
  entries: number
  tagLinks: number
}

/**
 * Should the demo data be reset now? Pure helper so the plugin's schedule
 * logic is unit-testable. `lastResetIso` = marker file content (ISO date) or
 * null when no marker exists. Resets when the marker is missing, unreadable,
 * older than 24h, or absurdly in the future (clock stepped backwards).
 */
export function shouldResetDemo(lastResetIso: string | null, now: Date = new Date()): boolean {
  if (!lastResetIso) return true
  const last = Date.parse(lastResetIso)
  if (Number.isNaN(last)) return true
  const elapsed = now.getTime() - last
  return elapsed >= 24 * 3_600_000 || elapsed < -60_000
}

export async function resetDemoData(db: PostgresJsDatabase<typeof schema>): Promise<DemoResetCounts> {
  const { users, orgs, orgMembers, clients, projects, tasks, tags, timeEntries, entryTags } = schema

  // ------------------------------------------------------------------- wipe
  // org delete cascades clients/projects/tasks/tags/time_entries/entry_tags/org_members.
  const existingOrgs = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.name, ORG_NAME))
  for (const o of existingOrgs) await db.delete(orgs).where(eq(orgs.id, o.id))
  await db.delete(users).where(eq(users.email, USER_EMAIL))

  // ------------------------------------------------------------------- base
  const [mara] = await db
    .insert(users)
    .values({
      name: 'Mara Juhl',
      email: USER_EMAIL,
      passwordHash: hashPassword('tick-demo'),
      defaultRate: 85
    })
    .returning()
  const [org] = await db.insert(orgs).values({ name: ORG_NAME }).returning()
  if (!mara || !org) throw new Error('failed to insert user/org')
  await db.insert(orgMembers).values({ orgId: org.id, userId: mara.id, role: 'owner' })

  // ---------------------------------------------------------------- catalog
  const [northwind, acme, playtone] = await db
    .insert(clients)
    .values([
      { orgId: org.id, name: 'Northwind Legal', rate: 110 },
      { orgId: org.id, name: 'Acme Co' },
      { orgId: org.id, name: 'Playtone' }
    ])
    .returning()

  const [intakeForm, contractPortal, websiteRedesign, brandRefresh] = await db
    .insert(projects)
    .values([
      { orgId: org.id, name: 'Intake form', clientId: northwind!.id, rate: 95, estimateMinutes: 20 * 60 },
      { orgId: org.id, name: 'Contract review portal', clientId: northwind!.id, estimateMinutes: 60 * 60 },
      { orgId: org.id, name: 'Website redesign', clientId: acme!.id, estimateMinutes: 40 * 60 },
      { orgId: org.id, name: 'Brand refresh', clientId: playtone!.id, estimateMinutes: 20 * 60 }
    ])
    .returning()

  const insertedTasks = await db
    .insert(tasks)
    .values([
      { orgId: org.id, name: 'Homepage hero', projectId: websiteRedesign!.id, estimateMinutes: 12 * 60 },
      { orgId: org.id, name: 'Intake form validation', projectId: intakeForm!.id, estimateMinutes: 8 * 60 },
      { orgId: org.id, name: 'Fix flaky CI job', projectId: null },
      { orgId: org.id, name: 'Checkout flow', projectId: websiteRedesign!.id, estimateMinutes: 10 * 60 },
      { orgId: org.id, name: 'Sitemap + IA', projectId: websiteRedesign!.id, done: true },
      { orgId: org.id, name: 'Kickoff deck', projectId: brandRefresh!.id, done: true },
      { orgId: org.id, name: 'Conflict-check questionnaire', projectId: intakeForm!.id, done: true }
    ])
    .returning()
  const task = (name: string) => {
    const t = insertedTasks.find(t => t.name === name)
    if (!t) throw new Error(`missing task ${name}`)
    return t
  }

  const insertedTags = await db
    .insert(tags)
    .values([
      { orgId: org.id, name: 'meeting' },
      { orgId: org.id, name: 'design' },
      { orgId: org.id, name: 'dev' }
    ])
    .returning()
  const tagId = new Map(insertedTags.map(t => [t.name, t.id]))

  // ---------------------------------------------------------------- entries
  type Ref = { type: 'client' | 'project' | 'task'; id: string } | null
  interface Spec {
    name: string
    ref: Ref
    billable: boolean
    tags: string[]
    rateOverride?: number
    start: Date
    end: Date
  }

  const today = new Date()
  const at = (dayOffset: number, h: number, m: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOffset, h, m)

  // Today — exactly these three (match screenshots). No running entry.
  const specs: Spec[] = [
    {
      name: 'Hero layout pass',
      ref: { type: 'task', id: task('Homepage hero').id },
      billable: true,
      tags: ['design'],
      start: at(0, 9, 5),
      end: at(0, 11, 20)
    },
    {
      name: 'Standup + planning',
      ref: null,
      billable: false,
      tags: ['meeting'],
      start: at(0, 11, 30),
      end: at(0, 12, 0)
    },
    {
      name: 'Intake form validation',
      ref: { type: 'task', id: task('Intake form validation').id },
      billable: true,
      tags: [],
      start: at(0, 13, 0),
      end: at(0, 14, 45)
    }
  ]

  // Past 21 days — weekdays heavier, mix of billable/non-billable, some tagged.
  const templates: Omit<Spec, 'start' | 'end'>[] = [
    { name: 'Hero layout pass', ref: { type: 'task', id: task('Homepage hero').id }, billable: true, tags: ['design'] },
    { name: 'Nav + footer components', ref: { type: 'task', id: task('Homepage hero').id }, billable: true, tags: ['design', 'dev'] },
    { name: 'Checkout error states', ref: { type: 'task', id: task('Checkout flow').id }, billable: true, tags: ['design'] },
    { name: 'Cart drawer states', ref: { type: 'task', id: task('Checkout flow').id }, billable: true, tags: ['dev'] },
    { name: 'Intake form validation', ref: { type: 'task', id: task('Intake form validation').id }, billable: true, tags: [] },
    { name: 'Intake form wireframes', ref: { type: 'task', id: task('Intake form validation').id }, billable: true, tags: ['design'] },
    { name: 'Fix flaky CI job', ref: { type: 'task', id: task('Fix flaky CI job').id }, billable: false, tags: ['dev'] },
    { name: 'Portal architecture notes', ref: { type: 'project', id: contractPortal!.id }, billable: true, tags: ['dev'] },
    { name: 'Client call — scope', ref: { type: 'project', id: contractPortal!.id }, billable: true, tags: ['meeting'] },
    { name: 'Standup + planning', ref: null, billable: false, tags: ['meeting'] },
    { name: 'Design review', ref: { type: 'project', id: websiteRedesign!.id }, billable: true, tags: ['meeting', 'design'] },
    { name: 'Moodboard exploration', ref: { type: 'project', id: brandRefresh!.id }, billable: true, tags: ['design'] },
    { name: 'Logo sketches', ref: { type: 'project', id: brandRefresh!.id }, billable: true, tags: ['design'] },
    { name: 'Reply to Northwind re: scope', ref: { type: 'client', id: northwind!.id }, billable: true, tags: [] },
    { name: 'Rush contract triage', ref: { type: 'client', id: northwind!.id }, billable: true, tags: [], rateOverride: 130 },
    { name: 'Invoice prep', ref: null, billable: false, tags: [] },
    { name: 'Component library cleanup', ref: { type: 'project', id: websiteRedesign!.id }, billable: true, tags: ['dev'] }
  ]

  const rand = mulberry32(0x71c4) // deterministic
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!
  for (let dayOffset = 1; dayOffset <= 21; dayOffset++) {
    const dow = at(dayOffset, 12, 0).getDay()
    const weekend = dow === 0 || dow === 6
    const n = weekend ? (rand() < 0.3 ? 1 : 0) : 3 + Math.floor(rand() * 3) // 0–1 weekend, 3–5 weekday
    let cursorMin = (weekend ? 10 : 8) * 60 + 30 + Math.floor(rand() * 45) // start ~8:30–9:15 (10:30+ wknd)
    for (let i = 0; i < n; i++) {
      const tpl = pick(templates)
      const durMin = 30 + 15 * Math.floor(rand() * 11) // 30m – 3h, 15-min steps
      const startMin = cursorMin
      cursorMin += durMin + (rand() < 0.4 ? 15 + Math.floor(rand() * 60) : 5) // gap between blocks
      if (cursorMin > 18 * 60) break
      specs.push({
        ...tpl,
        start: at(dayOffset, Math.floor(startMin / 60), startMin % 60),
        end: at(dayOffset, Math.floor((startMin + durMin) / 60), (startMin + durMin) % 60)
      })
    }
  }

  const insertedEntries = await db
    .insert(timeEntries)
    .values(
      specs.map(s => ({
        orgId: org.id,
        userId: mara.id,
        name: s.name,
        refType: s.ref?.type ?? null,
        refId: s.ref?.id ?? null,
        billable: s.billable,
        rateOverride: s.rateOverride ?? null,
        start: s.start,
        end: s.end
      }))
    )
    .returning()

  const tagRows = insertedEntries.flatMap((e, i) =>
    specs[i]!.tags.map(name => ({ entryId: e.id, tagId: tagId.get(name)! }))
  )
  if (tagRows.length) await db.insert(entryTags).values(tagRows)

  return {
    tasks: insertedTasks.length,
    tags: insertedTags.length,
    entries: insertedEntries.length,
    tagLinks: tagRows.length
  }
}
