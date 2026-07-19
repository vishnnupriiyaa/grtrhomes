import test from 'node:test'
import assert from 'node:assert/strict'
import { getRoleProfileFields, createPropertyDraft, buildUserRegistrationDocument, getAccountDeletionTargets, isGoogleMailAccount, isValidEmail, normalizeEmail } from '../lib/onboarding.mjs'

test('owner onboarding includes property setup fields', () => {
  const profile = getRoleProfileFields('owner')
  assert.equal(profile.companyName, '')
  assert.equal(profile.properties.length, 1)
  assert.equal(profile.properties[0].name, '')
})

test('tenant onboarding omits property entries', () => {
  const profile = getRoleProfileFields('tenant')
  assert.deepEqual(profile.properties, [])
  assert.equal(profile.emergencyContact, '')
})

test('property draft creates a blank entry', () => {
  const draft = createPropertyDraft()
  assert.equal(draft.name, '')
  assert.equal(draft.address, '')
  assert.equal(draft.image, '')
})

test('registration document stores profile details', () => {
  const doc = buildUserRegistrationDocument({
    name: 'Ava',
    email: 'ava@example.com',
    password: 'secret123',
    role: 'owner',
    profile: { companyName: 'Ava Homes', properties: [{ name: 'River House' }] },
  }, 'user-123')
  assert.equal(doc.profile.companyName, 'Ava Homes')
  assert.equal(doc.profile.properties[0].name, 'River House')
})

test('email validation accepts real addresses and rejects fake ones', () => {
  assert.equal(isValidEmail('user@gmail.com'), true)
  assert.equal(isValidEmail('owner@outlook.com'), true)
  assert.equal(isValidEmail('fake@tempmail.com'), false)
  assert.equal(isValidEmail('mock-user@example.com'), false)
  assert.equal(isGoogleMailAccount('user@gmail.com'), true)
  assert.equal(isGoogleMailAccount('user@googlemail.com'), true)
  assert.equal(isGoogleMailAccount('owner@outlook.com'), false)
  assert.equal(normalizeEmail(' User@Gmail.COM '), 'user@gmail.com')
})

test('google registration stores google auth without a password', () => {
  const doc = buildUserRegistrationDocument({
    name: 'Ava',
    email: 'ava@gmail.com',
    password: 'secret123',
    role: 'owner',
    authMethod: 'google',
  }, 'user-456')
  assert.equal(doc.authMethod, 'google')
  assert.equal(doc.password, '')
})

test('account deletion targets include the signed-in user and related records', () => {
  const targets = getAccountDeletionTargets({ id: 'user-1', email: 'User@Gmail.com' })
  assert.equal(targets.email, 'user@gmail.com')
  assert.deepEqual(targets.ticketQuery, { $or: [{ tenantId: 'user-1' }, { ownerId: 'user-1' }, { managerId: 'user-1' }] })
})
