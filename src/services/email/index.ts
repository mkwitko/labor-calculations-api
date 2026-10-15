import { Resend } from 'resend'
import { env } from '@/env'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> {
  if (!resend) {
    console.log('RESEND_API_KEY not set — skipping email', { to, subject })
    return
  }

  await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject,
    html,
  })
}

export { resend }
