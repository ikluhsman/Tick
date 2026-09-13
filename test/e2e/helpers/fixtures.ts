// Constants describing the seeded fixture (server/utils/demo.ts) plus the
// test database the suite is allowed to write to.

export const TEST_DATABASE_URL
  = process.env.E2E_DATABASE_URL ?? 'postgresql://tick:tick_dev_password@localhost:5432/tick_test'

export const SEED_USER = {
  email: 'mara@example.com',
  password: 'tick-demo',
  name: 'Mara Juhl',
  orgName: 'Hollow Studio',
  /** users.default_rate — the fallback $/h when nothing deeper resolves. */
  defaultRate: 85
} as const

/** Catalog rows the specs attach to. */
export const SEED = {
  clientWithRate: { name: 'Northwind Legal', rate: 110 },
  /** No client rate → entries resolve to the user default. */
  projectNoRate: { name: 'Website redesign', client: 'Acme Co' },
  projectBrand: { name: 'Brand refresh', client: 'Playtone' },
  /** Today's three seeded entries, per server/utils/demo.ts. */
  todayEntries: ['Hero layout pass', 'Standup + planning', 'Intake form validation']
} as const

/** Unique-per-run suffix so a leaked row can never collide with a later run. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Accessible-name matcher for "starts with this entry/project name" — entry
 * names are user text ("Standup + planning"), so they must be escaped before
 * they go into a RegExp.
 */
export function startsWith(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
}
