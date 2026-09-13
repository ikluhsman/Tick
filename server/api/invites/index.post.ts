// POST /api/invites — create an invite (owner/admin only). When SMTP is
// configured the invitee gets an email with the join link; either way the
// response carries the token so the UI can always offer a copyable
// /register?invite=TOKEN link. `emailSent` tells the UI which state to show.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { escapeMailHtml, isMailConfigured, renderMailButton, renderMailHtml, sendMail } from '../../utils/mail'
import type { InviteCreateDto } from '~~/shared/types/mail'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  role: z.enum(['owner', 'admin', 'member']).default('member')
})

const EXPIRY_DAYS = 7

export default defineEventHandler(async (event): Promise<InviteCreateDto> => {
  demoGuard(event) // 403 in demo mode — no inviting strangers into the demo org
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can invite members.' })
  }
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  // No granting a role above your own: only owners can invite new owners.
  if (body.role === 'owner' && user.role !== 'owner') {
    throw createError({ statusCode: 403, message: 'Only owners can invite new owners.' })
  }
  const db = useDrizzle()

  const alreadyMember = await db
    .select({ userId: schema.orgMembers.userId })
    .from(schema.orgMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId))
    .where(and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.users.email, body.email)))
    .limit(1)
  if (alreadyMember.length) {
    throw createError({ statusCode: 409, message: 'That person is already a member of this organization.' })
  }

  const [invite] = await db
    .insert(schema.invites)
    .values({
      orgId: user.orgId,
      email: body.email,
      role: body.role,
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    })
    .returning()

  let emailSent = false
  if (isMailConfigured()) {
    const link = `${getRequestURL(event).origin}/register?invite=${invite!.token}`
    const result = await sendMail({
      to: invite!.email,
      subject: `${user.name} invited you to ${user.orgName} on Tick`,
      html: renderMailHtml({
        heading: `Join ${escapeMailHtml(user.orgName)} on Tick`,
        bodyHtml: `<p style="margin:0;">${escapeMailHtml(user.name)} invited you to join <strong>${escapeMailHtml(user.orgName)}</strong> on Tick as ${invite!.role === 'admin' ? 'an' : 'a'} ${invite!.role} — a self-hosted time tracker.</p>${renderMailButton(link, 'Accept invite')}`,
        footerText: `This invite expires in ${EXPIRY_DAYS} days and works once. If you weren’t expecting it, you can ignore this email.`
      }),
      text: `${user.name} invited you to join ${user.orgName} on Tick as ${invite!.role}.\n\nAccept the invite here:\n\n${link}\n\nThe invite expires in ${EXPIRY_DAYS} days and works once. If you weren't expecting it, ignore this email.`
    })
    emailSent = result.sent
  }

  return {
    id: invite!.id,
    email: invite!.email,
    role: invite!.role as InviteCreateDto['role'],
    token: invite!.token,
    expiresAt: invite!.expiresAt.toISOString(),
    createdAt: invite!.createdAt.toISOString(),
    emailSent
  }
})
