import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import bcrypt from 'bcryptjs'

const scrypt = promisify(scryptCallback)

const PASSWORD_MIN_LENGTH = 4

export function validatePasswordSecurity(password = '') {
  const value = String(password || '')
  const checks = {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    hasLetter: /[A-Za-z]/.test(value),
    hasDigit: /\d/.test(value),
  }

  const valid = Object.values(checks).every(Boolean)

  return {
    valid,
    checks,
    message: valid
      ? 'Password is strong enough.'
      : 'Password must be at least 4 characters and include a combination of letters and numbers.',
  }
}

export async function hashPassword(password = '') {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(String(password), salt, 64)
  return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`
}

export async function verifyPassword(storedPassword = '', suppliedPassword = '') {
  try {
    const stored = String(storedPassword || '')
    const supplied = String(suppliedPassword || '')
    if (!stored || !supplied) return false

    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      return await bcrypt.compare(supplied, stored)
    }

    // Backward compatibility for legacy plaintext users.
    if (!stored.startsWith('scrypt$')) {
      return stored === supplied
    }

    const [, salt, hashHex] = stored.split('$')
    if (!salt || !hashHex) return false

    const derived = await scrypt(supplied, salt, 64)
    const expected = Buffer.from(hashHex, 'hex')
    const candidate = Buffer.from(derived)

    if (expected.length !== candidate.length) return false
    return timingSafeEqual(expected, candidate)
  } catch {
    return false
  }
}

export function hashOtp(code = '') {
  return createHash('sha256').update(String(code)).digest('hex')
}

export function isOtpExpired(expiresAt) {
  if (!expiresAt) return true
  const ts = new Date(expiresAt).getTime()
  return Number.isNaN(ts) || ts < Date.now()
}

export function generateOtp() {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}
