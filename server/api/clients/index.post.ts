// POST /api/clients — {name, rate?} → ClientDto.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  rate: z.number().nonnegative().nullish()
})

export default defineEventHandler(async (event): Promise<ClientDto> => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const [row] = await db
    .insert(schema.clients)
    .values({ orgId: user.orgId, name: body.name, rate: body.rate ?? null })
    .returning()

  return {
    id: row!.id,
    name: row!.name,
    rate: row!.rate,
    color: clientColor(row!.id),
    projectCount: 0,
    taskCount: 0,
    trackedSec: 0,
    amount: 0
  }
})
