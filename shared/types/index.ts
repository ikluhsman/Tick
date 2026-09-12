// Shared DTO types — used by server API responses and client stores.
// Server derives chain + rates at read time (README Rule 1/2); clients never compute inheritance.

export type RefType = 'client' | 'project' | 'task'

export interface ChainRef {
  refType: RefType
  refId: string
  /** Resolved display chain, deepest first: task → project → client */
  taskId?: string
  taskName?: string
  projectId?: string
  projectName?: string
  clientId?: string
  clientName?: string
  clientColor?: string
}

export interface EntryDto {
  id: string
  name: string
  ref: ChainRef | null
  billable: boolean
  /** $/h actually in effect (Rule 2), null when nothing resolves */
  resolvedRate: number | null
  /** True when rate came from entry.rate_override */
  rateOverridden: boolean
  start: string // ISO
  end: string | null // null = running
  durationSec: number
  amount: number | null // billable ? hours * resolvedRate : null
  tags: string[]
}

export interface ClientDto {
  id: string
  name: string
  rate: number | null
  color: string // deterministic from palette
  projectCount: number
  taskCount: number
  trackedSec: number
  amount: number
}

export interface ProjectDto {
  id: string
  name: string
  clientId: string | null
  clientName: string | null
  clientColor: string | null
  rate: number | null
  /** Rate in effect + where it came from */
  resolvedRate: number | null
  rateSource: 'project' | 'client' | 'member' | 'user' | 'none'
  billableDefault: boolean
  estimateMinutes: number | null
  visibility: 'private' | 'public'
  archived: boolean
  openTasks: number
  doneTasks: number
  trackedSec: number
  amount: number
}

export interface TaskDto {
  id: string
  name: string
  projectId: string | null
  projectName: string | null
  clientName: string | null
  estimateMinutes: number | null
  done: boolean
  entryCount: number
  trackedSec: number
}

export interface TagDto {
  id: string
  name: string
  entryCount: number
  trackedSec: number
  usedOn: number
  lastUsed: string | null
}

export interface TimerState {
  entryId: string
  name: string
  ref: ChainRef | null
  billable: boolean
  resolvedRate: number | null
  start: string
}

export interface CascadeCounts {
  projects: number
  tasks: number
  entries: number
}

export interface DeleteResult {
  /** Soft-deleted ids per entity, for undo/restore */
  deleted: { clients: string[]; projects: string[]; tasks: string[]; entries: string[] }
  /** Rows kept but detached (ref/client cleared) */
  detached: { projects: number; tasks: number; entries: number }
}

export interface DashboardSummary {
  todaySec: number
  todayEntries: number
  weekSec: number
  weekBillableSec: number
  unbilledAmount: number
  unbilledClients: number
  /** 16 weeks × Mon–Fri, hours per day; oldest week first */
  activity: { date: string; hours: number }[]
  /** Mon–Sun of current week */
  weekDays: { date: string; billableSec: number; nonBillableSec: number }[]
  billablePct: number
}

export interface SessionUser {
  id: string
  name: string
  email: string
  defaultRate: number | null
  orgId: string
  orgName: string
  role: 'owner' | 'admin' | 'member'
}
