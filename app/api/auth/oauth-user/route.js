import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { connectToMongo } from '@/lib/mongo'
import { v4 as uuidv4 } from 'uuid'
import { getRoleProfileFields, isGoogleMailAccount, normalizeEmail } from '@/lib/onboarding.mjs'

const clean = (doc) => {
  if (!doc) return doc
  const { _id, password, ...rest } = doc
  return rest
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = normalizeEmail(session?.user?.email)
  const name = session?.user?.name?.trim() || email.split('@')[0]
  const image = session?.user?.image || ''

  if (!session?.user || !email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (session.user.provider !== 'auth0' || !session.user.emailVerified || !isGoogleMailAccount(email)) {
    return NextResponse.json({ error: 'Social account verification failed' }, { status: 403 })
  }

  const db = await connectToMongo()
  let user = await db.collection('users').findOne({ email })

  if (!user) {
    const profile = {
      ...getRoleProfileFields('tenant'),
      profilePhoto: image,
    }

    user = {
      id: uuidv4(),
      email,
      password: '',
      name,
      phone: '',
      role: 'tenant',
      createdAt: new Date().toISOString(),
      profile,
      authMethod: 'oauth',
      lastGoogleSignInAt: new Date().toISOString(),
    }

    await db.collection('users').insertOne(user)
    return NextResponse.json({ user: clean(user), provisioned: true })
  }

  await db.collection('users').updateOne(
    { id: user.id },
    {
      $set: {
        name,
        authMethod: user.authMethod || 'oauth',
        'profile.profilePhoto': image || user.profile?.profilePhoto || '',
        updatedAt: new Date().toISOString(),
        lastGoogleSignInAt: new Date().toISOString(),
      },
    },
  )

  return NextResponse.json({
    user: clean({
      ...user,
      name,
      authMethod: user.authMethod || 'oauth',
      profile: {
        ...(user.profile || {}),
        profilePhoto: image || user.profile?.profilePhoto || '',
      },
    }),
  })
}