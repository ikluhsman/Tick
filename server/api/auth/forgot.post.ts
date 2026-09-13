// POST /api/auth/forgot {email} — start a password reset. ALWAYS responds with
// the same generic 200 so the endpoint can't be used to enumerate accounts.
// If the email matches a user: create a one-hour single-use token and email the
// reset link. Without SMTP configured, the link is logged to the server console
// instead so self-hosters can still recover accounts (documented in .env.example).
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { escapeMailHtml, isMailConfigured, renderMailButton, renderMailHtml, sendMail } from '../../utils/mail'
import type { ForgotResponseDto } from '~~/shared/types/mail'

const bodySchema = z.object({
  // Lenient like login: format errors must not leak anything either.
  email: z.string().trim().toLowerCase().min(1).max(254)
})

const EXPIRY_MS = 60 * 60 * 1000 // 1 hour

// Timing floor: the known-email path does real work (token insert + mail/log)
// the unknown-email path skips, so raw response times would reveal whether an
// account exists. Every response is padded to at least this long. (With SMTP
// configured a slow relay can still push the known path past the floor —
// self-hosters who care should use an async-queueing relay.)
const MIN_RESPONSE_MS = 200

export default defineEventHandler(async (event): Promise<ForgotResponseDto> => {
  const startedAt = Date.now()
  // Sanitized validation: unauth-reachable, must not echo zod internals.
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, body.email),
    columns: { id: true, name: true, email: true }
  })

  if (user) {
    // 36 random bytes → 48-char base64url token.
    const token = randomBytes(36).toString('base64url')
    await db.insert(schema.passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + EXPIRY_MS)
    })

    const link = `${getRequestURL(event).origin}/reset-password?token=${token}`
    if (isMailConfigured()) {
      await sendMail({
        to: user.email,
        subject: 'Reset your Tick password',
        html: renderMailHtml({
          heading: 'Reset your password',
          bodyHtml: `<p style="margin:0;">Hi ${escapeMailHtml(user.name)}, someone (hopefully you) asked to reset the password for this Tick account.</p>${renderMailButton(link, 'Choose a new password')}`,
          footerText: 'This link expires in 1 hour and works once. If you didn’t request it, you can safely ignore this email.'
        }),
        text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset the password for this Tick account. Choose a new password here:\n\n${link}\n\nThe link expires in 1 hour and works once. If you didn't request it, ignore this email.`
      })
    } else {
      // No SMTP: surface the link in server logs so self-hosters can recover.
      console.info(`[mail] SMTP not configured — password reset link for ${user.email}: ${link}`)
    }
  }

  const elapsed = Date.now() - startedAt
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_MS - elapsed))
  }
  return { ok: true }
})
