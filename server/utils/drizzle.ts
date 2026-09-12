// Singleton Drizzle client for Nitro server routes. Auto-imported as useDrizzle().
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

export { schema }
// Query helpers, auto-imported alongside useDrizzle in server code.
export {
  and,
  asc,
  between,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notInArray,
  or,
  sql,
  sum
} from 'drizzle-orm'

export type DB = PostgresJsDatabase<typeof schema>

// Survive dev HMR without leaking connections.
const globalForDb = globalThis as unknown as { __tickDb?: DB }

export function useDrizzle(): DB {
  if (!globalForDb.__tickDb) {
    const client = postgres(useRuntimeConfig().databaseUrl, { max: 10 })
    globalForDb.__tickDb = drizzle(client, { schema })
  }
  return globalForDb.__tickDb
}
