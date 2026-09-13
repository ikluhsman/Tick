// PATCH /api/me/theme — persist the theme editor state to users.theme (jsonb).
// Bounded strictly: known keys only, short strings, unknown keys stripped,
// whole payload capped at 2KB — a jsonb column is not a dumping ground.
import { z } from 'zod'

const MAX_THEME_BYTES = 2048

// Mirrors ThemeSettings in app/stores/theme.ts. Values stay loose strings
// (≤40 chars) rather than enums so new presets/fonts don't need a server
// change; z.object strips unknown keys by default.
const themeSchema = z.object({
  preset: z.string().max(40).optional(),
  primary: z.string().max(40).optional(),
  neutral: z.string().max(40).optional(),
  radius: z.number().min(0).max(32).optional(),
  font: z.string().max(40).optional(),
  mode: z.string().max(40).optional(),
  starfield: z.boolean().optional()
})

const bodySchema = z.object({ theme: themeSchema })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const raw = await readRawBody(event, 'utf8')
  if (raw && Buffer.byteLength(raw, 'utf8') > MAX_THEME_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input', data: { fields: ['theme'] } })
  }
  const body = await readSanitizedBody(event, bodySchema)

  await useDrizzle()
    .update(schema.users)
    .set({ theme: body.theme })
    .where(eq(schema.users.id, user.id))

  return { ok: true }
})
