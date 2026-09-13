// The single validation code path for every server route (public and
// session-guarded alike). A raw ZodError thrown through createError — which is
// what readValidatedBody / getValidatedQuery / schema.parse do — echoes schema
// internals (expected types, enum options, regex patterns, issue paths) to the
// caller, and an uncaught one from a router param even lands as a 500 with a
// stack trace. These helpers map every failure to the same terse envelope:
// 400 { statusMessage: 'Invalid input', data: { fields: [names] } }.
//
// Use: readSanitizedBody (body), readSanitizedBodyOptional (body may be
// absent), getSanitizedQuery (?query), sanitizedRouterParam / uuidRouterParam
// (:params), sanitizedParse (anything else). Never call .parse() in a route.
import { z } from 'zod'
import type { H3Event } from 'h3'

const uuidSchema = z.uuid()

function invalidInput(error: z.ZodError, fallbackFields: string[] = []): never {
  const fields = [
    ...new Set(
      error.issues
        .map(i => i.path[0])
        .filter((p): p is string => typeof p === 'string')
    )
  ]
  // Scalar values (router params, non-object bodies) have empty issue paths;
  // name them from the call site so the envelope still says which input failed.
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid input',
    data: { fields: fields.length ? fields : fallbackFields }
  })
}

/** readValidatedBody, but ZodError → terse 400 with field names only. */
export async function readSanitizedBody<S extends z.ZodType>(
  event: H3Event,
  schema: S
): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input', data: { fields: [] } })
  }
  const result = schema.safeParse(body)
  if (!result.success) invalidInput(result.error)
  return result.data
}

/**
 * readSanitizedBody for routes where the body is optional (cascade-delete
 * flags): an absent or unreadable body validates as `{}` so schema defaults
 * apply, while a present-but-invalid body still gets the terse 400.
 */
export async function readSanitizedBodyOptional<S extends z.ZodType>(
  event: H3Event,
  schema: S
): Promise<z.output<S>> {
  const body = (await readBody(event).catch(() => null)) ?? {}
  return sanitizedParse(schema, body)
}

/** getValidatedQuery, but ZodError → terse 400 with field names only. */
export function getSanitizedQuery<S extends z.ZodType>(
  event: H3Event,
  schema: S
): z.output<S> {
  return sanitizedParse(schema, getQuery(event))
}

/** A router param through a schema; failures report the param name as the field. */
export function sanitizedRouterParam<S extends z.ZodType>(
  event: H3Event,
  name: string,
  schema: S
): z.output<S> {
  return sanitizedParse(schema, getRouterParam(event, name), [name])
}

/**
 * A uuid router param → terse 400 instead of the 500 + zod dump (or, for
 * params used raw, a leaked Postgres "invalid input syntax for type uuid").
 */
export function uuidRouterParam(event: H3Event, name = 'id'): string {
  return sanitizedRouterParam(event, name, uuidSchema)
}

/** schema.parse(value), but ZodError → terse 400. */
export function sanitizedParse<S extends z.ZodType>(
  schema: S,
  value: unknown,
  fallbackFields: string[] = []
): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) invalidInput(result.error, fallbackFields)
  return result.data
}
