import { Resend } from "resend"

const FROM = process.env["EMAIL_FROM"] ?? "PayFlow <noreply@payflow.dev>"

function getClient(): Resend | null {
  const key = process.env["RESEND_API_KEY"]
  if (!key) return null
  return new Resend(key)
}

interface SendOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  const client = getClient()

  if (!client) {
    // No API key — log instead of sending (dev mode)
    process.stdout.write(
      `[email] (no RESEND_API_KEY) would send to=${opts.to} subject="${opts.subject}"\n`
    )
    return
  }

  const { error } = await client.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}
