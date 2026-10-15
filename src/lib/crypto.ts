import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/env'

const ALGORITHM = 'aes-256-gcm'
const MAX_BODY_SIZE = 10 * 1024
const SENSITIVE_KEYS = new Set([
  'password',
  'confirmPassword',
  'token',
  'refreshToken',
  'accessToken',
])

let cachedKey: Buffer | null | undefined

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey

  const keyHex = env.ADMIN_ENCRYPTION_KEY
  if (!keyHex) {
    cachedKey = null
    return null
  }
  if (keyHex.length !== 64) {
    console.error(
      'ADMIN_ENCRYPTION_KEY must be 64 hex chars (32 bytes) — encryption disabled',
    )
    cachedKey = null
    return null
  }

  cachedKey = Buffer.from(keyHex, 'hex')
  return cachedKey
}

export function encrypt(text: string | null): string | null {
  if (!text) return null
  const key = getKey()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encoded: string | null): string | null {
  if (!encoded) return null
  const key = getKey()
  if (!key) return null
  try {
    const [ivHex, authTagHex, encryptedHex] = encoded.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
  } catch (err) {
    console.warn(
      'Decryption failed — possible key rotation or data corruption',
      {
        error: err instanceof Error ? err.message : String(err),
      },
    )
    return null
  }
}

export function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) =>
      SENSITIVE_KEYS.has(key) ? [key, '[redacted]'] : [key, value],
    ),
  )
}

export function capSize(str: string | null): string | null {
  if (!str) return null
  if (str.length > MAX_BODY_SIZE)
    return `${str.slice(0, MAX_BODY_SIZE)}...[truncated]`
  return str
}
