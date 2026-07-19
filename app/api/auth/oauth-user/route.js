import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { connectToMongo } from '@/lib/mongo'
import { isGoogleMailAccount, normalizeEmail } from '@/lib/onboarding.mjs'

const clean = (doc) => {
  if (!doc) return doc
  const { _id, password, ...rest } = doc
  return rest
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = normalizeEmail(session?.user?.email)

  if (!session?.user || !email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (session.user.provider !== 'google' || !session.user.emailVerified || !isGoogleMailAccount(email)) {
    return NextResponse.json({ error: 'Google account verification failed' }, { status: 403 })
  }

  const db = await connectToMongo()
  const user = await db.collection('users').findOne({ email })

  if (!user) {
    return NextResponse.json({ error: 'No portal account found for this Google account' }, { status: 404 })
  }

  await db.collection('users').updateOne(
    { id: user.id },
    {
      $set: {
        updatedAt: new Date().toISOString(),
        lastGoogleSignInAt: new Date().toISOString(),
      },
    },
  )

  return NextResponse.json({ user: clean(user) })
}