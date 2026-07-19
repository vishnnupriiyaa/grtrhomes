import GoogleProvider from 'next-auth/providers/google'
import { isGoogleMailAccount, normalizeEmail } from '@/lib/onboarding.mjs'

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false
      const email = normalizeEmail(profile?.email)
      const emailVerified = Boolean(profile?.email_verified)
      if (!emailVerified || !isGoogleMailAccount(email)) {
        return '/login?error=google-account-not-allowed'
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