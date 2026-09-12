// Outgoing mail via SMTP (nodemailer), configured through runtimeConfig
// (NUXT_SMTP_HOST/PORT/USER/PASS/SECURE + NUXT_MAIL_FROM). SMTP is optional:
// isMailConfigured() gates every send, and sendMail() resolves {sent:false}
// when unconfigured so callers degrade gracefully (invites keep the copyable
// link; forgot-password logs the reset link to the server console instead).
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface SendMailInput {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendMailResult {
  sent: boolean
}

export function isMailConfigured(): boolean {
  const cfg = useRuntimeConfig()
  return Boolean(cfg.smtpHost && cfg.mailFrom)
}

// Survive dev HMR without stacking SMTP pools.
const globalForMail = globalThis as unknown as { __tickMailer?: Transporter }

function useTransport(): Transporter {
  if (!globalForMail.__tickMailer) {
    const cfg = useRuntimeConfig()
    const secure = cfg.smtpSecure === 'true'
    globalForMail.__tickMailer = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort ? Number(cfg.smtpPort) : secure ? 465 : 587,
      secure,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined
    })
  }
  return globalForMail.__tickMailer
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!isMailConfigured()) {
    console.info(`[mail] SMTP not configured — skipping "${input.subject}" to ${input.to}`)
    return { sent: false }
  }
  try {
    await useTransport().sendMail({
      from: useRuntimeConfig().mailFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    })
    return { sent: true }
  } catch (err) {
    console.error(`[mail] failed to send "${input.subject}" to ${input.to}:`, err)
    return { sent: false }
  }
}

/** Escape user-provided text (names, org names) before interpolating into email HTML. */
export function escapeMailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Minimal standalone HTML email shell — text "Tick" wordmark header, one body
 * block, muted footer. Email clients need inline styles and can't resolve app
 * theme tokens, so static hex colors are used here (Nocturne-ish palette) —
 * exempt from the no-hex rule per CONTRACTS (static email HTML).
 */
export function renderMailHtml(opts: { heading: string, bodyHtml: string, footerText: string }): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f6;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e2e2e8;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 28px;border-bottom:1px solid #ececf1;">
            <span style="font-size:18px;font-weight:600;letter-spacing:-0.01em;color:#161826;">Tick</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 12px;font-size:17px;font-weight:500;color:#161826;">${opts.heading}</h1>
            <div style="font-size:14px;line-height:1.6;color:#3f424d;">${opts.bodyHtml}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #ececf1;">
            <p style="margin:0;font-size:12px;color:#9397ab;">${opts.footerText}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Primary action button for email bodies (static colors — see renderMailHtml). */
export function renderMailButton(href: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${href}" style="display:inline-block;padding:10px 18px;border:1px solid #6366f1;border-radius:8px;color:#6366f1;font-size:14px;font-weight:500;text-decoration:none;">${label}</a></p>
  <p style="margin:0;font-size:12px;color:#9397ab;word-break:break-all;">Or paste this link into your browser:<br>${href}</p>`
}
