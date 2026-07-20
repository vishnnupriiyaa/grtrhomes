import Auth0Provider from 'next-auth/providers/auth0'
import { normalizeEmail } from '@/lib/onboarding.mjs'

if (!process.env.NEXTAUTH_URL && process.env.VERCEL_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`
}

function resolveAuth0Issuer(rawIssuer = '') {
  const value = String(rawIssuer || '').trim()
  if (!value) return ''
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  return withScheme.replace(/\/+$/, '')
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID || '',
      clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
      issuer: resolveAuth0Issuer(process.env.AUTH0_ISSUER),
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'auth0') return false
      const emailVerified = Boolean(profile?.email_verified)
      if (!emailVerified) {
        return '/login?error=social-account-not-allowed'
      }
      return true
    },
    async jwt({ token, account, profile }) {
      if (account?.provider) {
        token.provider = account.provider
      }
      if (profile) {
        token.emailVerified = Boolean(profile.email_verified)
        token.picture = profile.picture || token.picture
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = normalizeEmail(session.user.email)
        session.user.provider = token.provider
        session.user.emailVerified = Boolean(token.emailVerified)
        session.user.image = token.picture || session.user.image
      }
      return session
    },
  },
}