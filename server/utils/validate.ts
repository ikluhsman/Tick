// Sanitized zod validation for routes reachable without a session (auth/*,
// invite lookup) — and safe to use anywhere. A raw ZodError thrown through
// createError echoes schema internals (expected types, enum options, paths)
// to the client; these helpers map failures to a terse, uniform
// 400 { statusMessage: 'Invalid input', data: { fields: [names] } } instead.
import type { H3Event } from 'h3'
import type { z } from 'zod'

function invalidInput(error: z.ZodError): never {
  const fields = [
    ...new Set(
      error.issues
        .map(i => i.path[0])
        .filter((p): p is string => typeof p === 'string')
    )
  ]
  throw createError({ statusCode: 400, statusMessage: 'Invalid input', data: { fields } })
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

/** schema.parse(value), but ZodError → terse 400 (for router params / queries). */
export function sanitizedParse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) invalidInput(result.error)
  return result.data
}
