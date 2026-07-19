export const createPropertyDraft = (overrides = {}) => ({
  name: '',
  address: '',
  monthlyRent: '',
  image: '',
  images: [],
  description: '',
  propertyType: '',
  ...overrides,
})

const DISALLOWED_EMAIL_TOKENS = ['mock', 'fake', 'temp', 'tempmail', 'example', 'test', 'demo']

export const normalizeEmail = (value = '') => (value || '').trim().toLowerCase()

export const isGoogleMailAccount = (value = '') => {
  const email = normalizeEmail(value)
  if (!email.includes('@')) return false
  const [, domain] = email.split('@')
  return domain === 'gmail.com' || domain === 'googlemail.com'
}

export const isValidEmail = (value = '') => {
  const email = normalizeEmail(value)
  if (!email) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return false
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return false
  const domainName = domain.toLowerCase()
  if (DISALLOWED_EMAIL_TOKENS.some((token) => domainName.includes(token) || localPart.includes(token))) return false
  return true
}

export const buildUserRegistrationDocument = (payload, id) => ({
  id,
  email: normalizeEmail(payload.email),
  password: payload.authMethod === 'google' ? '' : payload.password,
  name: payload.name,
  phone: payload.phone || '',
  role: payload.role,
  createdAt: new Date().toISOString(),
  profile: payload.profile || {},
  authMethod: payload.authMethod || 'email-password',
})

export const getAccountDeletionTargets = (user) => ({
  userId: user.id,
  email: normalizeEmail(user.email),
  propertyQuery: { $or: [{ ownerId: user.id }, { managerId: user.id }] },
  ticketQuery: { $or: [{ tenantId: user.id }, { ownerId: user.id }, { managerId: user.id }] },
  tenantAssignmentQuery: { tenantId: user.id },
})

export const getRoleProfileFields = (role) => {
  switch (role) {
    case 'owner':
      return {
        companyName: '',
        address: '',
        profilePhoto: '',
        bio: '',
        properties: [createPropertyDraft()],
      }
    case 'manager':
      return {
        companyName: '',
        address: '',
        serviceArea: '',
        managedPropertyCount: '1',
        profilePhoto: '',
        bio: '',
        properties: [createPropertyDraft()],
      }
    case 'tenant':
      return {
        emergencyContact: '',
        preferredContact: '',
        leaseStart: '',
        leaseEnd: '',
        profilePhoto: '',
        notes: '',
        properties: [],
      }
    default:
      return {
        companyName: '',
        address: '',
        profilePhoto: '',
        bio: '',
        properties: [],
      }
  }
}
