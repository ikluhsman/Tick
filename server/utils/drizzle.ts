// Singleton Drizzle client for Nitro server routes. Auto-imported as useDrizzle().
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql as drizzleSql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
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

/**
 * `column = any($1::uuid[])` — ONE bind parameter for any number of ids.
 * Use instead of inArray() wherever the id list is unbounded (entry ids from a
 * range query, a cascade subtree): inArray binds one parameter per id, which
 * is slow to bind for thousands of ids and fails outright past Postgres'
 * 65,535-parameter protocol limit. Ids must come from the database or be
 * zod-validated uuids; anything else fails the cast (it is still one bound
 * parameter, never spliced SQL). An empty list matches nothing.
 */
export function inUuids(column: AnyColumn, ids: readonly string[]): SQL {
  return drizzleSql`${column} = any(${`{${ids.join(',')}}`}::uuid[])`
}

// Survive dev HMR without leaking connections.
const globalForDb = globalThis as unknown as { __tickDb?: DB }

export function useDrizzle(): DB {
  if (!globalForDb.__tickDb) {
    const client = postgres(useRuntimeConfig().databaseUrl, { max: 10 })
    globalForDb.__tickDb = drizzle(client, { schema })
  }
  return globalForDb.__tickDb
}
