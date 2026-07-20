import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { isMailConfigured, sendEmail } from '@/lib/mail'
import { connectToMongo } from '@/lib/mongo'
import { buildUserRegistrationDocument, getAccountDeletionTargets, isGoogleMailAccount, isValidEmail, normalizeEmail } from '@/lib/onboarding.mjs'
import { generateOtp, hashOtp, hashPassword, isOtpExpired, validatePasswordSecurity, verifyPassword } from '@/lib/security'

function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

const clean = (doc) => {
  if (!doc) return doc
  const {
    _id,
    password,
    deleteAccountOtpCode,
    deleteAccountOtpHash,
    deleteAccountOtpExpiresAt,
    deleteAccountOtpRequestedAt,
    resetPasswordOtpHash,
    resetPasswordOtpExpiresAt,
    resetPasswordOtpRequestedAt,
    ...rest
  } = doc
  return rest
}

const ok = (data, status = 200) => handleCORS(NextResponse.json(data, { status }))
const err = (msg, status = 400) => handleCORS(NextResponse.json({ error: msg }, { status }))

async function resolveTicketRecipients(db, property, payload = {}) {
  const relatedUsers = property?.ownerId || property?.managerId
    ? await db.collection('users').find({ id: { $in: [property?.ownerId, property?.managerId].filter(Boolean) } }).toArray()
    : []

  const owner = relatedUsers.find((candidate) => candidate.id === property?.ownerId)
  const manager = relatedUsers.find((candidate) => candidate.id === property?.managerId)

  const candidates = [
    { role: 'owner', email: normalizeEmail(payload.ownerEmail || property?.ownerEmail || owner?.email), name: owner?.name || property?.ownerName || 'Owner' },
    { role: 'manager', email: normalizeEmail(payload.managerEmail || property?.managerEmail || manager?.email), name: manager?.name || property?.managerName || 'Manager' },
    { role: 'tenant', email: normalizeEmail(payload.tenantEmail), name: payload.tenantName || 'Tenant' },
  ]

  const seen = new Set()
  const recipients = candidates.filter(({ email }) => {
    if (!isValidEmail(email) || seen.has(email)) return false
    seen.add(email)
    return true
  })

  return { owner, manager, recipients }
}

function buildPropertyDocumentsForUser(user, role, properties = []) {
  return properties
    .filter(Boolean)
    .map((property, index) => ({
      id: uuidv4(),
      name: property.name || `Property ${index + 1}`,
      address: property.address || '',
      image: property.image || '',
      description: property.description || '',
      monthlyRent: property.monthlyRent || '',
      ownerId: user.id,
      ownerName: user.name,
      tenantId: '',
      tenantName: '',
      tenantEmail: '',
      tenantPhone: '',
      managerId: role === 'manager' ? user.id : '',
      managerName: role === 'manager' ? user.name : '',
      createdAt: new Date().toISOString(),
    }))
}

async function sendOtpEmail({ to, subject, intro, otp }) {
  await sendEmail({
    to,
    subject,
    text: `${intro} ${otp}. This code expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2>${subject}</h2>
        <p>${intro}</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${otp}</p>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  })
}

async function sendTicketEmails({ recipients, ticket, property, eventType }) {
  if (!recipients.length) return []
  if (!isMailConfigured()) {
    return recipients.map((recipient) => ({
      to: recipient.email,
      role: recipient.role,
      method: 'email',
      status: 'skipped',
      reason: 'SMTP email delivery is not configured',
      at: new Date().toISOString(),
    }))
  }

  const isCreated = eventType === 'created'
  const subject = isCreated
    ? `New maintenance ticket for ${property?.address || 'your property'}`
    : `Maintenance ticket updated: ${ticket.title}`
  const headline = isCreated ? 'A new maintenance ticket has been submitted.' : 'A maintenance ticket has been updated.'
  const statusLine = `Status: ${String(ticket.status || 'open').replace('_', ' ')}`
  const bodyText = [
    headline,
    `Property: ${property?.address || ticket.propertyAddress || 'Unknown property'}`,
    `Title: ${ticket.title}`,
    `Priority: ${ticket.priority}`,
    statusLine,
    `Tenant: ${ticket.tenantName || 'Unknown tenant'}${ticket.tenantEmail ? ` (${ticket.tenantEmail})` : ''}`,
    '',
    ticket.description || '',
  ].join('\n')

  return Promise.all(recipients.map(async (recipient) => {
    try {
      const delivery = await sendEmail({
        to: recipient.email,
        subject,
        text: bodyText,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
            <h2 style="margin-bottom: 12px;">${headline}</h2>
            <p><strong>Property:</strong> ${property?.address || ticket.propertyAddress || 'Unknown property'}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Priority:</strong> ${ticket.priority}</p>
            <p><strong>Status:</strong> ${String(ticket.status || 'open').replace('_', ' ')}</p>
            <p><strong>Tenant:</strong> ${ticket.tenantName || 'Unknown tenant'}${ticket.tenantEmail ? ` (${ticket.tenantEmail})` : ''}</p>
            <p style="margin-top: 16px;"><strong>Description</strong><br />${ticket.description || ''}</p>
          </div>
        `,
      })

      return {
        to: recipient.email,
        role: recipient.role,
        method: 'email',
        status: 'delivered',
        messageId: delivery.messageId,
        at: new Date().toISOString(),
      }
    } catch (emailError) {
      return {
        to: recipient.email,
        role: recipient.role,
        method: 'email',
        status: 'failed',
        reason: emailError.message,
        at: new Date().toISOString(),
      }
    }
  }))
}

async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    if (route === '/' && method === 'GET') return ok({ message: 'GRTR Homes API' })

    /* ---------- AUTH ---------- */
    if ((route === '/auth/register' || route === '/app-auth/register') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      const authMethod = b.authMethod === 'google' ? 'google' : 'email-password'
      if (!normalizedEmail || !b.name || !b.role) return err('email, name, role required')
      if (authMethod === 'email-password' && !b.password) return err('password required')
      if (!isValidEmail(normalizedEmail)) return err('Please use a real email address')
      if (authMethod === 'google' && !isGoogleMailAccount(normalizedEmail)) return err('Continue with Google requires a Gmail account')
      const existing = await db.collection('users').findOne({ email: normalizedEmail })
      if (existing) return err('Email already registered')

      if (authMethod === 'email-password') {
        const passwordValidation = validatePasswordSecurity(b.password)
        if (!passwordValidation.valid) return err(passwordValidation.message)

        if (!isMailConfigured()) {
          const hashedPassword = await hashPassword(b.password)
          const user = buildUserRegistrationDocument({
            ...b,
            email: normalizedEmail,
            password: hashedPassword,
            authMethod,
            emailVerified: true,
            emailVerifiedAt: new Date().toISOString(),
          }, uuidv4())

          user.password = hashedPassword
          user.emailVerified = true
          user.emailVerifiedAt = new Date().toISOString()

          await db.collection('users').insertOne(user)

          if ((user.role === 'owner' || user.role === 'manager') && Array.isArray(user.profile?.properties)) {
            const propertyDocs = buildPropertyDocumentsForUser(user, user.role, user.profile.properties)
            if (propertyDocs.length) {
              await db.collection('properties').insertMany(propertyDocs)
            }
          }

          return ok({
            user: clean(user),
            warning: 'SMTP not configured. Account created without email verification OTP.',
          })
        }

        const verificationCode = String(b.verificationCode || '').trim()
        const pendingCollection = db.collection('pending_registrations')

        if (!verificationCode) {
          const otp = generateOtp()
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
          const passwordHash = await hashPassword(b.password)

          await pendingCollection.updateOne(
            { email: normalizedEmail },
            {
              $set: {
                email: normalizedEmail,
                name: b.name,
                phone: b.phone || '',
                role: b.role,
                profile: b.profile || {},
                authMethod,
                passwordHash,
                verificationOtpHash: hashOtp(otp),
                verificationOtpExpiresAt: expiresAt,
                verificationOtpRequestedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              $setOnInsert: {
                id: uuidv4(),
                createdAt: new Date().toISOString(),
              },
            },
            { upsert: true },
          )

          await sendOtpEmail({
            to: normalizedEmail,
            subject: 'Verify your GRTR Homes email',
            intro: 'Use this code to verify your email address and finish creating your account.',
            otp,
          })

          return ok({
            verificationRequired: true,
            message: 'Verification code sent. Enter the 6-digit code to complete registration.',
          }, 202)
        }

        const pendingRegistration = await pendingCollection.findOne({ email: normalizedEmail })
        if (!pendingRegistration) return err('No pending registration found. Request a new verification code.', 404)
        if (isOtpExpired(pendingRegistration.verificationOtpExpiresAt)) {
          return err('Verification code expired. Request a new code and try again.', 401)
        }
        if (pendingRegistration.verificationOtpHash !== hashOtp(verificationCode)) {
          return err('Verification code is incorrect.', 401)
        }

        const user = buildUserRegistrationDocument({
          ...pendingRegistration,
          email: normalizedEmail,
          password: pendingRegistration.passwordHash,
          authMethod,
          emailVerified: true,
          emailVerifiedAt: new Date().toISOString(),
        }, uuidv4())

        user.password = pendingRegistration.passwordHash
        user.emailVerified = true
        user.emailVerifiedAt = new Date().toISOString()

        await db.collection('users').insertOne(user)
        await pendingCollection.deleteOne({ email: normalizedEmail })

        if ((user.role === 'owner' || user.role === 'manager') && Array.isArray(user.profile?.properties)) {
          const propertyDocs = buildPropertyDocumentsForUser(user, user.role, user.profile.properties)
          if (propertyDocs.length) {
            await db.collection('properties').insertMany(propertyDocs)
          }
        }

        return ok({ user: clean(user) })
      }

      const user = buildUserRegistrationDocument({
        ...b,
        email: normalizedEmail,
        authMethod,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
      }, uuidv4())
      user.emailVerified = true
      user.emailVerifiedAt = new Date().toISOString()
      await db.collection('users').insertOne(user)
      if ((b.role === 'owner' || b.role === 'manager') && Array.isArray(b.profile?.properties)) {
        const propertyDocs = buildPropertyDocumentsForUser(user, b.role, b.profile.properties)
        if (propertyDocs.length) {
          await db.collection('properties').insertMany(propertyDocs)
        }
      }
      return ok({ user: clean(user) })
    }

    if ((route === '/auth/login' || route === '/app-auth/login') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      const authMethod = b.authMethod === 'google' ? 'google' : 'email-password'
      if (!isValidEmail(normalizedEmail, { enforceRealAddress: false })) return err('Please enter a valid email address', 401)
      if (authMethod === 'google') {
        if (!isGoogleMailAccount(normalizedEmail)) return err('Continue with Google requires a Gmail account', 401)
        const user = await db.collection('users').findOne({ email: normalizedEmail })
        if (!user) return err('No account found for this Google email', 404)
        if (user.authMethod && user.authMethod !== 'google') return err('This account uses email and password sign-in', 401)
        return ok({ user: clean({ ...user, authMethod: 'google' }) })
      }
      const user = await db.collection('users').findOne({ email: normalizedEmail })
      if (!user) return err('Invalid email or password', 401)
      if (!b.password) return err('Password is required', 401)
      const passwordOk = await verifyPassword(user.password, b.password)
      if (!passwordOk) return err('Invalid email or password', 401)

      // Temporary compatibility: auto-mark legacy accounts verified on successful login.
      if (user.emailVerified !== true) {
        await db.collection('users').updateOne(
          { id: user.id },
          {
            $set: {
              emailVerified: true,
              emailVerifiedAt: user.emailVerifiedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        )
      }
      return ok({ user: clean(user) })
    }

    if ((route === '/auth/delete-account' || route === '/app-auth/delete-account') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      if (!normalizedEmail || !b.userId) return err('userId and email required')
      const user = b.userId
        ? await db.collection('users').findOne({ id: b.userId })
        : await db.collection('users').findOne({ email: normalizedEmail })
      if (!user) return err('Account not found', 404)
      if (normalizeEmail(user.email) !== normalizedEmail) return err('Account verification failed', 403)
      if (b.verificationMethod === 'otp') {
        const otp = String(b.otp || '').trim()
        if (!otp) return err('OTP is required to delete this account')
        if ((!user.deleteAccountOtpHash && !user.deleteAccountOtpCode) || !user.deleteAccountOtpExpiresAt) return err('No active deletion OTP found', 401)
        if (isOtpExpired(user.deleteAccountOtpExpiresAt)) return err('Your deletion OTP has expired', 401)
        const hashedInputOtp = hashOtp(otp)
        const otpMatches = user.deleteAccountOtpHash
          ? user.deleteAccountOtpHash === hashedInputOtp
          : user.deleteAccountOtpCode === otp
        if (!otpMatches) return err('The deletion OTP is incorrect', 401)
      } else {
        if (!user.password) return err('This account must be verified with an emailed OTP before deletion', 400)
        if (!b.currentPassword) return err('Current password is required to delete this account', 401)
        const isCurrentPasswordValid = await verifyPassword(user.password, b.currentPassword)
        if (!isCurrentPasswordValid) return err('Current password is incorrect', 401)
      }
      const targets = getAccountDeletionTargets(user)
      await db.collection('users').deleteOne({ id: user.id })
      await db.collection('properties').deleteMany(targets.propertyQuery)
      await db.collection('properties').updateMany(targets.tenantAssignmentQuery, {
        $set: { tenantId: '', tenantName: '', tenantEmail: '', tenantPhone: '' },
      })
      await db.collection('tickets').deleteMany(targets.ticketQuery)
      if (isMailConfigured()) {
        await sendEmail({
          to: targets.email,
          subject: 'Your GRTR Homes account was deleted',
          text: 'Your account has been permanently deleted. If this was not you, contact support immediately.',
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
              <h2>Account deleted</h2>
              <p>Your GRTR Homes account has been permanently deleted.</p>
              <p>If this action was not requested by you, contact support immediately.</p>
            </div>
          `,
        }).catch(() => {})
      }
      return ok({ deleted: true, email: targets.email })
    }

    if ((route === '/auth/delete-account/request-otp' || route === '/app-auth/delete-account/request-otp') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      if (!normalizedEmail || !b.userId) return err('userId and email required')
      if (!isMailConfigured()) return err('SMTP email delivery is not configured for OTP verification', 503)
      const user = await db.collection('users').findOne({ id: b.userId })
      if (!user) return err('Account not found', 404)
      if (normalizeEmail(user.email) !== normalizedEmail) return err('Account verification failed', 403)

      const otp = generateOtp()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      await db.collection('users').updateOne(
        { id: user.id },
        {
          $set: {
            deleteAccountOtpHash: hashOtp(otp),
            deleteAccountOtpExpiresAt: expiresAt,
            deleteAccountOtpRequestedAt: new Date().toISOString(),
          },
          $unset: {
            deleteAccountOtpCode: '',
          },
        },
      )

      await sendOtpEmail({
        to: normalizedEmail,
        subject: 'GRTR Homes account deletion verification code',
        intro: 'Use this code to confirm deletion of your GRTR Homes account.',
        otp,
      })

      return ok({ message: 'A deletion verification code has been sent to your email address.' })
    }

    if ((route === '/auth/forgot-password' || route === '/app-auth/forgot-password') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      if (!normalizedEmail) return err('email required')

      const user = await db.collection('users').findOne({ email: normalizedEmail })
      if (user && user.password) {
        const otp = generateOtp()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

        await db.collection('users').updateOne(
          { id: user.id },
          {
            $set: {
              resetPasswordOtpHash: hashOtp(otp),
              resetPasswordOtpExpiresAt: expiresAt,
              resetPasswordOtpRequestedAt: new Date().toISOString(),
            },
          },
        )

        if (isMailConfigured()) {
          await sendOtpEmail({
            to: normalizedEmail,
            subject: 'GRTR Homes password reset code',
            intro: 'Use this code to reset your GRTR Homes account password.',
            otp,
          })
        }
      }

      return ok({ message: 'If an account exists, a password reset code has been sent.' })
    }

    if ((route === '/auth/reset-password' || route === '/app-auth/reset-password') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      const otp = String(b.otp || '').trim()
      if (!normalizedEmail || !otp || !b.newPassword) {
        return err('email, otp, newPassword required')
      }

      const passwordValidation = validatePasswordSecurity(b.newPassword)
      if (!passwordValidation.valid) return err(passwordValidation.message)

      const user = await db.collection('users').findOne({ email: normalizedEmail })
      if (!user || !user.resetPasswordOtpHash || !user.resetPasswordOtpExpiresAt) {
        return err('Invalid reset request', 401)
      }
      if (isOtpExpired(user.resetPasswordOtpExpiresAt)) {
        return err('Your reset code has expired', 401)
      }
      if (user.resetPasswordOtpHash !== hashOtp(otp)) {
        return err('The reset code is incorrect', 401)
      }

      const newPasswordMatchesCurrent = await verifyPassword(user.password, b.newPassword)
      if (newPasswordMatchesCurrent) {
        return err('New password must be different from your current password')
      }

      const hashedPassword = await hashPassword(b.newPassword)
      await db.collection('users').updateOne(
        { id: user.id },
        {
          $set: {
            password: hashedPassword,
            updatedAt: new Date().toISOString(),
          },
          $unset: {
            resetPasswordOtpHash: '',
            resetPasswordOtpExpiresAt: '',
            resetPasswordOtpRequestedAt: '',
          },
        },
      )

      return ok({ message: 'Password reset successfully' })
    }

    if ((route === '/auth/change-password' || route === '/app-auth/change-password') && method === 'POST') {
      const b = await request.json()
      const normalizedEmail = normalizeEmail(b.email)
      if (!normalizedEmail || !b.currentPassword || !b.newPassword) return err('email, currentPassword, newPassword required')

      const passwordValidation = validatePasswordSecurity(b.newPassword)
      if (!passwordValidation.valid) return err(passwordValidation.message)

      const user = await db.collection('users').findOne({ email: normalizedEmail })
      if (!user) return err('Current password is incorrect', 401)

      const currentPasswordValid = await verifyPassword(user.password, b.currentPassword)
      if (!currentPasswordValid) return err('Current password is incorrect', 401)

      const newPasswordMatchesCurrent = await verifyPassword(user.password, b.newPassword)
      if (newPasswordMatchesCurrent) return err('New password must be different from your current password')

      const hashedPassword = await hashPassword(b.newPassword)
      await db.collection('users').updateOne({ id: user.id }, { $set: { password: hashedPassword, updatedAt: new Date().toISOString() } })
      return ok({ message: 'Password updated successfully' })
    }

    if (route === '/users' && method === 'GET') {
      const users = await db.collection('users').find({}).toArray()
      return ok(users.map(clean))
    }

    /* ---------- PROPERTIES ---------- */
    if (route === '/properties' && method === 'GET') {
      const url = new URL(request.url)
      const userId = url.searchParams.get('userId')
      const role = url.searchParams.get('role')
      let query = {}
      if (role === 'owner') query.ownerId = userId
      else if (role === 'tenant') query.tenantId = userId
      const list = await db.collection('properties').find(query).sort({ createdAt: -1 }).toArray()
      return ok(list.map(clean))
    }

    if (route === '/properties' && method === 'POST') {
      const b = await request.json()
      const p = {
        id: uuidv4(),
        ...b,
        images: Array.isArray(b.images) ? b.images : (b.image ? [b.image] : []),
        createdAt: new Date().toISOString(),
      }
      await db.collection('properties').insertOne(p)
      return ok(clean(p))
    }

    const propMatch = route.match(/^\/properties\/([^/]+)$/)
    if (propMatch) {
      const id = propMatch[1]
      if (method === 'GET') {
        const p = await db.collection('properties').findOne({ id })
        return p ? ok(clean(p)) : err('Not found', 404)
      }
      if (method === 'PUT') {
        const b = await request.json()
        delete b._id; delete b.id
        await db.collection('properties').updateOne({ id }, { $set: { ...b, updatedAt: new Date().toISOString() } })
        const updated = await db.collection('properties').findOne({ id })
        return ok(clean(updated))
      }
      if (method === 'DELETE') {
        const b = await request.json().catch(() => ({}))
        const requesterUserId = b.userId
        const requesterRole = b.role
        if (!requesterUserId || !requesterRole) return err('userId and role required', 401)

        const property = await db.collection('properties').findOne({ id })
        if (!property) return err('Property not found', 404)

        const canDelete =
          (requesterRole === 'owner' && property.ownerId === requesterUserId) ||
          (requesterRole === 'manager' && (!property.managerId || property.managerId === requesterUserId))

        if (!canDelete) return err('Not authorized to delete this property', 403)

        await db.collection('properties').deleteOne({ id })
        await db.collection('tickets').deleteMany({ propertyId: id })
        return ok({ deleted: true })
      }
    }

    /* ---------- TICKETS ---------- */
    if (route === '/tickets' && method === 'GET') {
      const url = new URL(request.url)
      const userId = url.searchParams.get('userId')
      const role = url.searchParams.get('role')
      let query = {}
      if (role === 'tenant') query.tenantId = userId
      else if (role === 'owner') {
        const owned = await db.collection('properties').find({ ownerId: userId }).toArray()
        query.propertyId = { $in: owned.map(p => p.id) }
      }
      const list = await db.collection('tickets').find(query).sort({ createdAt: -1 }).toArray()
      return ok(list.map(clean))
    }

    if (route === '/tickets' && method === 'POST') {
      const b = await request.json()
      const property = await db.collection('properties').findOne({ id: b.propertyId })
      if (!property) return err('Property not found', 404)
      const { owner, manager, recipients } = await resolveTicketRecipients(db, property, b)
      const ownerManagerRecipients = recipients.filter((recipient) => recipient.role === 'owner' || recipient.role === 'manager')
      if (!ownerManagerRecipients.length) {
        return err('Ticket cannot be raised because no valid owner or manager email is available for notifications.', 422)
      }
      const ownerEmail = normalizeEmail(property?.ownerEmail || owner?.email || b.ownerEmail || '')
      const managerEmail = normalizeEmail(property?.managerEmail || manager?.email || b.managerEmail || '')
      const t = {
        id: uuidv4(), ...b, status: 'open',
        propertyAddress: property?.address,
        ownerId: property?.ownerId, ownerEmail,
        managerId: property?.managerId, managerEmail,
        createdAt: new Date().toISOString(),
        notifications: [],
      }
      await db.collection('tickets').insertOne(t)
      const notifications = await sendTicketEmails({ recipients: ownerManagerRecipients, ticket: t, property, eventType: 'created' })
      await db.collection('tickets').updateOne(
        { id: t.id },
        {
          $set: {
            notifications,
          },
        },
      )
      return ok(clean({
        ...t,
        notifications,
        notificationSummary: {
          delivered: notifications.filter((item) => item.status === 'delivered').length,
          failed: notifications.filter((item) => item.status === 'failed').length,
          skipped: notifications.filter((item) => item.status === 'skipped').length,
        },
      }))
    }

    const ticketMatch = route.match(/^\/tickets\/([^/]+)$/)
    if (ticketMatch) {
      const id = ticketMatch[1]
      if (method === 'PUT') {
        const b = await request.json()
        delete b._id; delete b.id
        const existingTicket = await db.collection('tickets').findOne({ id })
        const nextStatus = b.status || existingTicket?.status
        await db.collection('tickets').updateOne({ id }, { $set: { ...b, updatedAt: new Date().toISOString() } })
        const updated = await db.collection('tickets').findOne({ id })
        if (existingTicket && updated && nextStatus !== existingTicket.status) {
          const property = await db.collection('properties').findOne({ id: updated.propertyId })
          const { recipients } = await resolveTicketRecipients(db, property, updated)
          const notifications = await sendTicketEmails({ recipients, ticket: updated, property, eventType: 'updated' })
          await db.collection('tickets').updateOne(
            { id },
            {
              $set: {
                notifications: [...(updated.notifications || []), ...notifications],
              },
            },
          )
          updated.notifications = [...(updated.notifications || []), ...notifications]
        }
        return ok(clean(updated))
      }
      if (method === 'DELETE') {
        await db.collection('tickets').deleteOne({ id })
        return ok({ deleted: true })
      }
    }

    /* ---------- SEED (real portfolio data) ---------- */
    if (route === '/seed' && method === 'POST') {
      await db.collection('users').deleteMany({})
      await db.collection('properties').deleteMany({})
      await db.collection('tickets').deleteMany({})

      const nowIso = new Date().toISOString()
      // Parse dates like "MM/DD/YYYY" or "Mon D, YYYY" into ISO
      const iso = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toISOString() }

      // ---- USERS ----
      const manager = { id: uuidv4(), name: 'Rachel Cooper', email: 'manager@grtr.com', password: 'demo123', phone: '512-555-0100', role: 'manager', createdAt: nowIso }

      // Two owners from spreadsheet
      const ownerBTS = { id: uuidv4(), name: 'BTS Rinu', email: 'btsrinu@gmail.com', password: 'demo123', phone: '512-555-1000', role: 'owner', createdAt: nowIso }
      const ownerRavi = { id: uuidv4(), name: 'Ravi Nasika', email: 'ravi.nasika@gmail.com', password: 'demo123', phone: '512-555-2000', role: 'owner', createdAt: nowIso }

      // Tenants (each gets a portal account)
      const tMike     = { id: uuidv4(), name: 'Mike Jones',        email: 'jones099672@yahoo.com', password: 'demo123', phone: '713-252-4874', role: 'tenant', createdAt: nowIso }
      const tTeresa   = { id: uuidv4(), name: 'Teresa Collier',    email: '4tacollier@gmail.com',  password: 'demo123', phone: '830-500-0800', role: 'tenant', createdAt: nowIso }
      const tRandall  = { id: uuidv4(), name: 'Randall Whitfield', email: 'newmillsen@gmail.com',  password: 'demo123', phone: '512-791-2905', role: 'tenant', createdAt: nowIso }
      const tKurt     = { id: uuidv4(), name: 'Kurt B Grindstaff', email: 'kurtb@example.com',     password: 'demo123', phone: '803-305-5165', role: 'tenant', createdAt: nowIso }
      const tSteven   = { id: uuidv4(), name: 'Stevenson Runyon',  email: 'sgrunyon7@aol.com',     password: 'demo123', phone: '512-555-3001', role: 'tenant', createdAt: nowIso }
      const tSamantha = { id: uuidv4(), name: 'Samantha Bender',   email: 'sjbender13@gmail.com',  password: 'demo123', phone: '307-272-2505', role: 'tenant', createdAt: nowIso }
      const tAdam     = { id: uuidv4(), name: 'Adam',              email: 'adam@example.com',      password: 'demo123', phone: '512-555-3003', role: 'tenant', createdAt: nowIso }
      const tKeith    = { id: uuidv4(), name: 'Keith',             email: 'keith@example.com',     password: 'demo123', phone: '512-555-3004', role: 'tenant', createdAt: nowIso }

      // Also add a quick-demo tenant alias
      const tDemo = { id: uuidv4(), name: 'Alex Rivera (Demo)', email: 'tenant@grtr.com', password: 'demo123', phone: '512-555-0300', role: 'tenant', createdAt: nowIso }
      // demo owner alias
      const oDemo = { id: uuidv4(), name: 'James Whitmore (Demo)', email: 'owner@grtr.com', password: 'demo123', phone: '512-555-0200', role: 'owner', createdAt: nowIso }

      await db.collection('users').insertMany([manager, ownerBTS, ownerRavi, tMike, tTeresa, tRandall, tKurt, tSteven, tSamantha, tAdam, tKeith, tDemo, oDemo])

      const houseImgs = [
        'https://images.pexels.com/photos/19344325/pexels-photo-19344325.jpeg',
        'https://images.pexels.com/photos/11018246/pexels-photo-11018246.jpeg',
        'https://images.unsplash.com/photo-1628624747186-a941c476b7ef',
        'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg',
        'https://images.pexels.com/photos/30580640/pexels-photo-30580640.jpeg',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be',
        'https://images.pexels.com/photos/19344325/pexels-photo-19344325.jpeg',
        'https://images.pexels.com/photos/11018246/pexels-photo-11018246.jpeg',
        'https://images.unsplash.com/photo-1628624747186-a941c476b7ef',
      ]
      let imgIdx = 0
      const nextImg = () => houseImgs[imgIdx++ % houseImgs.length]

      // ---- OWNER BTS Rinu — 5 properties ----
      const btsProps = [
        {
          id: uuidv4(), name: 'Siragusa Residence', address: '5704 Siragusa Dr, Austin, TX 78738', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: '', tenantName: '', tenantEmail: '', tenantPhone: '',
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 2400, securityDeposit: 0,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: iso('Aug 7, 2025'), insuranceEnd: iso('Aug 8, 2026'),
          loanProvider: 'Lakeview / Mr Cooper', loanAccountNumber: 'btsr', loanPassword: 'SreSri1977!',
          loanPortalUrl: '', roi: '', monthlyEmi: 2274.65, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Traviston Home', address: '5415 Traviston Dr, Austin, TX 78738', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tMike.id, tenantName: tMike.name, tenantEmail: tMike.email, tenantPhone: tMike.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'Fixed', leaseStart: '', leaseEnd: iso('04/01/2027'), monthlyRent: 2200, securityDeposit: 2200,
          insuranceProvider: 'Steadily', insurancePolicyNumber: '', insurancePortalUrl: 'https://app.steadily.com/customer/policies',
          insuranceStart: iso('02/08/2026'), insuranceEnd: iso('02/08/2027'),
          loanProvider: 'PNC', loanAccountNumber: 'btsr1', loanPassword: 'SysArm2008',
          loanPortalUrl: 'https://www.pnc.com', roi: '', monthlyEmi: 1249.78, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Lost Maples House', address: '366 Lost Maples, New Braunfels, TX', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tTeresa.id, tenantName: tTeresa.name, tenantEmail: tTeresa.email, tenantPhone: tTeresa.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'MTM', leaseStart: '', leaseEnd: '', monthlyRent: 1900, securityDeposit: 1900,
          insuranceProvider: 'SageSure', insurancePolicyNumber: '', insurancePortalUrl: 'https://my.sagesure.com/',
          insuranceStart: iso('Sep 29, 2025'), insuranceEnd: iso('Sep 29, 2026'),
          loanProvider: 'Mr Cooper', loanAccountNumber: 'btsr', loanPassword: 'SreSri1977!',
          loanPortalUrl: 'https://www.mrcooper.com', roi: '', monthlyEmi: 1077.14, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Lone Peak Retreat', address: '868 Lone Peak Way, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tRandall.id, tenantName: tRandall.name, tenantEmail: tRandall.email, tenantPhone: tRandall.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'MTM', leaseStart: '', leaseEnd: iso('02/27/2026'), monthlyRent: 2600, securityDeposit: 2600,
          insuranceProvider: 'MSI/MGA', insurancePolicyNumber: '', insurancePortalUrl: 'https://apps.msimga.com/Policy/Documents',
          insuranceStart: '', insuranceEnd: iso('02/27/2026'),
          loanProvider: 'Newrez / Shellpoint', loanAccountNumber: 'gmail', loanPassword: 'SreSriLonPea1977!',
          loanPortalUrl: 'https://www.newrez.com', roi: 6.13, monthlyEmi: 1733.92, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'El Capitan Estate', address: '256 El Capitan Lp, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tKurt.id, tenantName: tKurt.name, tenantEmail: tKurt.email, tenantPhone: tKurt.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'Fixed', leaseStart: '', leaseEnd: iso('04/30/2027'), monthlyRent: 3200, securityDeposit: 3200,
          insuranceProvider: 'SageSure', insurancePolicyNumber: '', insurancePortalUrl: 'https://my.sagesure.com/',
          insuranceStart: iso('03/12/2026'), insuranceEnd: iso('03/12/2027'), insuranceRenewalAmount: 2539.30,
          loanProvider: 'loanDepot', loanAccountNumber: 'gmail', loanPassword: 'SreSriLonPea1977!',
          loanPortalUrl: 'https://www.loandepot.com', roi: '', monthlyEmi: 2980.58, escrow: false,
          createdAt: nowIso,
        },
      ]

      // ---- OWNER Ravi Nasika — 4 properties ----
      const raviProps = [
        {
          id: uuidv4(), name: 'Traviston Home II', address: '5309 Traviston Dr, Austin, TX 78738', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tSteven.id, tenantName: tSteven.name, tenantEmail: tSteven.email, tenantPhone: tSteven.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 2500, securityDeposit: 2500,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: '', loanAccountNumber: '', loanPassword: '',
          loanPortalUrl: '', roi: '', monthlyEmi: 0, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Lone Peak Villa', address: '862 Lone Peak Way, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tSamantha.id, tenantName: tSamantha.name, tenantEmail: tSamantha.email, tenantPhone: tSamantha.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 3400, securityDeposit: 3400,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: 'Lakeview / Mr Cooper', loanAccountNumber: 'btsr', loanPassword: 'SreSri1977!',
          loanPortalUrl: 'https://www.mrcooper.com', roi: '', monthlyEmi: 3162.31, escrow: true,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'El Capitan 200', address: '200 El Capitan Lp, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tAdam.id, tenantName: tAdam.name, tenantEmail: tAdam.email, tenantPhone: tAdam.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 3000, securityDeposit: 0,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: '', loanAccountNumber: '', loanPassword: '',
          loanPortalUrl: '', roi: '', monthlyEmi: 0, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'El Capitan 386', address: '386 El Capitan Lp, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tKeith.id, tenantName: tKeith.name, tenantEmail: tKeith.email, tenantPhone: tKeith.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 3100, securityDeposit: 0,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: '', loanAccountNumber: '', loanPassword: '',
          loanPortalUrl: '', roi: '', monthlyEmi: 0, escrow: false,
          createdAt: nowIso,
        },
      ]

      // Also give demo owner one property for the "one-click Owner demo" button so demo makes sense
      const demoProp = {
        id: uuidv4(), name: 'Demo Property', address: '2100 Oak Meadow Dr, Austin TX 78745', image: nextImg(),
        ownerId: oDemo.id, ownerName: oDemo.name,
        tenantId: tDemo.id, tenantName: tDemo.name, tenantEmail: tDemo.email, tenantPhone: tDemo.phone,
        managerId: manager.id, managerName: manager.name,
        leaseType: 'Fixed', leaseStart: iso(new Date(Date.now() - 86400000*180).toISOString()),
        leaseEnd: iso(new Date(Date.now() + 86400000*180).toISOString()),
        monthlyRent: 2450, securityDeposit: 2450,
        insuranceProvider: 'State Farm', insurancePolicyNumber: 'SF-88291-TX', insurancePortalUrl: '',
        insuranceStart: iso(new Date(Date.now() - 86400000*90).toISOString()),
        insuranceEnd: iso(new Date(Date.now() + 86400000*270).toISOString()),
        loanProvider: 'Chase Bank', loanAccountNumber: 'CH-4021-88', loanPassword: '',
        loanPortalUrl: 'https://chase.com', roi: 6.75, monthlyEmi: 1820, escrow: false,
        createdAt: nowIso,
      }

      const allProps = [...btsProps, ...raviProps, demoProp]
      await db.collection('properties').insertMany(allProps)

      // ---- Sample tickets ----
      const mkTicket = (prop, tenant, title, description, priority, status, daysAgo) => ({
        id: uuidv4(), propertyId: prop.id, propertyAddress: prop.address,
        tenantId: tenant.id, tenantName: tenant.name, tenantEmail: tenant.email,
        ownerId: prop.ownerId, managerId: manager.id,
        title, description, priority, status,
        createdAt: new Date(Date.now() - 86400000 * daysAgo).toISOString(),
        notifications: [
          { to: prop.ownerName, method: 'email', at: nowIso },
          { to: manager.name, method: 'email', at: nowIso },
        ],
      })
      const tickets = [
        mkTicket(btsProps[3], tRandall, 'Garage door not closing', 'Sensor light blinks red — door reverses halfway. Started last night.', 'high', 'open', 1),
        mkTicket(btsProps[4], tKurt, 'Kitchen faucet leaking', 'Slow drip under the sink — pooling on cabinet floor.', 'medium', 'in_progress', 3),
        mkTicket(btsProps[1], tMike, 'AC not cooling below 78°F', 'Set to 72°F, thermostat won\'t drop. Filter changed last month.', 'high', 'open', 2),
        mkTicket(raviProps[1], tSamantha, 'Backyard sprinkler broken', 'Zone 3 sprays only sideways, flooding the deck.', 'low', 'resolved', 8),
      ]
      await db.collection('tickets').insertMany(tickets)

      return ok({
        ok: true,
        seeded: { users: 13, properties: allProps.length, tickets: tickets.length },
        credentials: {
          manager: 'manager@grtr.com',
          owners: ['btsrinu@gmail.com', 'ravi.nasika@gmail.com', 'owner@grtr.com'],
          tenants: ['jones099672@yahoo.com', '4tacollier@gmail.com', 'newmillsen@gmail.com', 'kurtb@example.com', 'sgrunyon7@aol.com', 'sjbender13@gmail.com', 'adam@example.com', 'keith@example.com', 'tenant@grtr.com'],
          password: 'demo123',
        },
      })
    }

    return err(`Route ${route} not found`, 404)
  } catch (e) {
    console.error('API Error:', e)
    return err('Internal server error: ' + e.message, 500)
  }
}
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
