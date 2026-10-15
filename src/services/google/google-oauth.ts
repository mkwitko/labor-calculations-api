import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from 'prisma/prisma'
import { env } from '@/env'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// OAuth `state` must not be a forgeable plaintext userId — otherwise an
// attacker could link their Google account to a victim's account. We sign
// `<userId>.<exp>` with an HMAC keyed by the server's JWT secret and verify it
// on callback, trusting only the verified userId (never the raw query value).
function stateSecret(): string {
  return env.JWT_PRIVATE_KEY
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url')
}

export function signOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`
  return `${payload}.${sign(payload)}`
}

export function verifyOAuthState(state: string): string | null {
  const parts = state.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const payload = `${userId}.${expStr}`
  const expected = sign(payload)
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null
  }
  if (Number(expStr) < Date.now()) return null
  return userId
}
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function isGoogleConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI,
  )
}

// Consent URL. `state` is an HMAC-signed token bound to the initiating user
// (see signOAuthState) — the callback trusts only the verified userId.
export function buildGoogleAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: env.GOOGLE_REDIRECT_URI as string,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state: signOAuthState(userId),
  })
  return `${AUTH_URL}?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
  email: string | null
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID as string,
      client_secret: env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: env.GOOGLE_REDIRECT_URI as string,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
  const token = (await res.json()) as TokenResponse

  let email: string | null = null
  try {
    const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    if (info.ok)
      email = ((await info.json()) as { email?: string }).email ?? null
  } catch {
    // best effort
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? '',
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    email,
  }
}

// Returns a valid access token for the user, refreshing if near expiry.
// Returns null when the user has no integration.
export async function getValidGoogleAccessToken(
  userId: string,
): Promise<string | null> {
  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  })
  if (!integration) return null

  if (integration.expiresAt.getTime() > Date.now() + 60_000) {
    return integration.accessToken
  }

  // refresh
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID as string,
      client_secret: env.GOOGLE_CLIENT_SECRET as string,
      refresh_token: integration.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const token = (await res.json()) as TokenResponse

  await prisma.googleIntegration.update({
    where: { userId },
    data: {
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
  })
  return token.access_token
}
