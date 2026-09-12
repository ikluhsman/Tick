// Tick — Drizzle schema (PostgreSQL). See handoff README "Entities" + Rules 1–4.
// Entries store only the deepest ref (ref_type/ref_id); chain + rates resolve at read time.
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  defaultRate: numeric('default_rate', { precision: 10, scale: 2, mode: 'number' }),
  theme: jsonb('theme'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const orgMembers = pgTable(
  'org_members',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    rate: numeric('rate', { precision: 10, scale: 2, mode: 'number' })
  },
  t => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    check('org_members_role_check', sql`${t.role} in ('owner', 'admin', 'member')`)
  ]
)

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rate: numeric('rate', { precision: 10, scale: 2, mode: 'number' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [index('clients_org_id_idx').on(t.orgId)]
)

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    rate: numeric('rate', { precision: 10, scale: 2, mode: 'number' }),
    billableDefault: boolean('billable_default').notNull().default(true),
    estimateMinutes: integer('estimate_minutes'),
    visibility: text('visibility').notNull().default('private'),
    archived: boolean('archived').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index('projects_org_id_idx').on(t.orgId),
    index('projects_client_id_idx').on(t.clientId),
    check('projects_visibility_check', sql`${t.visibility} in ('private', 'public')`)
  ]
)

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    estimateMinutes: integer('estimate_minutes'),
    done: boolean('done').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [index('tasks_org_id_idx').on(t.orgId), index('tasks_project_id_idx').on(t.projectId)]
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [unique('tags_org_id_name_unique').on(t.orgId, t.name)]
)

export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    /** Deepest ref only (Rule 1): 'client' | 'project' | 'task' | null */
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    billable: boolean('billable').notNull().default(true),
    rateOverride: numeric('rate_override', { precision: 10, scale: 2, mode: 'number' }),
    start: timestamp('start', { withTimezone: true }).notNull(),
    end: timestamp('end', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index('time_entries_user_start_idx').on(t.userId, t.start),
    index('time_entries_org_id_idx').on(t.orgId),
    index('time_entries_ref_id_idx').on(t.refId),
    // Timer = row with end IS NULL; at most ONE running (non-trashed) entry per user.
    uniqueIndex('time_entries_one_running_per_user')
      .on(t.userId)
      .where(sql`${t.end} is null and ${t.deletedAt} is null`),
    check('time_entries_ref_type_check', sql`${t.refType} in ('client', 'project', 'task')`)
  ]
)

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index('invites_org_id_idx').on(t.orgId),
    check('invites_role_check', sql`${t.role} in ('owner', 'admin', 'member')`)
  ]
)

export const entryTags = pgTable(
  'entry_tags',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => timeEntries.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  t => [primaryKey({ columns: [t.entryId, t.tagId] })]
)
