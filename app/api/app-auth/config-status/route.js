import { NextResponse } from 'next/server'

function normalizeUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, '')
}

function issuerDomain(issuer = '') {
  try {
    return new URL(issuer).hostname
  } catch {
    return ''
  }
}

export async function GET() {
  const nextAuthUrl = normalizeUrl(process.env.NEXTAUTH_URL || '')
  const vercelUrl = normalizeUrl(process.env.VERCEL_URL || '')
  const effectiveBaseUrl = nextAuthUrl || vercelUrl
  const auth0Issuer = normalizeUrl(process.env.AUTH0_ISSUER || '')

  const missing = []
  if (!effectiveBaseUrl) missing.push('NEXTAUTH_URL (or VERCEL_URL)')
  if (!process.env.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET')
  if (!auth0Issuer) missing.push('AUTH0_ISSUER')
  if (!process.env.AUTH0_CLIENT_ID) missing.push('AUTH0_CLIENT_ID')
  if (!process.env.AUTH0_CLIENT_SECRET) missing.push('AUTH0_CLIENT_SECRET')

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    auth: {
      effectiveBaseUrl,
      source: nextAuthUrl ? 'NEXTAUTH_URL' : (vercelUrl ? 'VERCEL_URL' : 'none'),
      nextAuthCallbackUrl: effectiveBaseUrl ? `${effectiveBaseUrl}/api/auth/callback/auth0` : '',
      auth0IssuerDomain: issuerDomain(auth0Issuer),
      hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      hasAuth0ClientId: Boolean(process.env.AUTH0_CLIENT_ID),
      hasAuth0ClientSecret: Boolean(process.env.AUTH0_CLIENT_SECRET),
    },
  })
}