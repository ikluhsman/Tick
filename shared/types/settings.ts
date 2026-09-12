// Settings-swing DTOs (profile, org, members, invites, trash).
// shared/types/index.ts is frozen — new types live here.

export interface OrgInfoDto {
  id: string
  name: string
  memberCount: number
  createdAt: string
}

export interface OrgMemberDto {
  userId: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  /** Per-member org rate override ($/h), null = inherit user default */
  rate: number | null
  defaultRate: number | null
}

export interface InviteDto {
  id: string
  email: string
  role: 'owner' | 'admin' | 'member'
  token: string
  expiresAt: string
  createdAt: string
}

/** Public lookup for the register page (?invite=TOKEN). */
export interface InviteLookupDto {
  email: string
  role: 'owner' | 'admin' | 'member'
  orgName: string
}

export type TrashEntity = 'clients' | 'projects' | 'tasks' | 'tags' | 'entries'

export interface TrashItemDto {
  id: string
  name: string
  deletedAt: string
  /** Whole days until the 30-day purge (0 = purges within a day) */
  daysLeft: number
}

export type TrashDto = Record<TrashEntity, TrashItemDto[]>
