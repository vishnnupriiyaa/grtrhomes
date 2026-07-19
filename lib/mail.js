import nodemailer from 'nodemailer'

let transporterPromise

const smtpPort = Number(process.env.SMTP_PORT || 587)

export const isMailConfigured = () => Boolean(
  process.env.SMTP_HOST
  && process.env.SMTP_USER
  && process.env.SMTP_PASS
  && process.env.SMTP_FROM,
)

async function getTransporter() {
  if (!isMailConfigured()) {
    throw new Error('SMTP email delivery is not configured')
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    }))
  }

  return transporterPromise
}

export async function sendEmail({ to, subject, text, html }) {
  const transporter = await getTransporter()
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  })

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  }
}