import { randomBytes } from 'node:crypto'
import type { ClientTokenPurpose } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { hashInviteToken } from '@/services/tenant/invite-token'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * Convite de primeiro acesso vale uma semana; redefinição de senha vale uma
 * hora, porque quem pede acabou de pedir e o link viaja por e-mail.
 */
const TTL_MS: Record<ClientTokenPurpose, number> = {
  invite: 7 * MS_PER_DAY,
  reset: 60 * 60 * 1000,
}

/**
 * O token cru existe em dois lugares: no e-mail do cliente e na resposta de
 * quem o criou. No banco fica só o sha256 — mesmo esquema de
 * `services/tenant/invite-token.ts`, que já vale para convite de advogado.
 */
export function generateClientToken(): string {
  return randomBytes(32).toString('base64url')
}

export function buildClientInviteUrl(token: string): string {
  return `${env.CLIENT_URL}/portal/convite/${token}`
}

export function buildClientResetUrl(token: string): string {
  return `${env.CLIENT_URL}/portal/reset-password?token=${token}`
}

/**
 * Emite um token e invalida os anteriores do mesmo propósito: pedir um novo
 * link tem que matar o link antigo, senão um e-mail vazado continua valendo.
 *
 * Roda com `systemPrisma` porque o caminho público (esqueci a senha) não tem
 * contexto de organização — o `organizationId` vem explícito do cliente.
 */
export async function issueClientAccessToken(params: {
  clientId: string
  organizationId: string
  purpose: ClientTokenPurpose
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateClientToken()
  const expiresAt = new Date(Date.now() + TTL_MS[params.purpose])

  await systemPrisma.$transaction([
    systemPrisma.clientAccessToken.updateMany({
      where: {
        clientId: params.clientId,
        purpose: params.purpose,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    }),
    systemPrisma.clientAccessToken.create({
      data: {
        clientId: params.clientId,
        organizationId: params.organizationId,
        tokenHash: hashInviteToken(token),
        purpose: params.purpose,
        expiresAt,
      },
    }),
  ])

  return { token, expiresAt }
}

type ResolvedToken = {
  id: string
  clientId: string
  organizationId: string
  purpose: ClientTokenPurpose
}

/** Lê sem consumir — para a tela que só quer saber se o link ainda vale. */
export async function resolveClientAccessToken(
  token: string,
  purpose: ClientTokenPurpose,
): Promise<ResolvedToken | null> {
  const row = await systemPrisma.clientAccessToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      clientId: true,
      organizationId: true,
      purpose: true,
      usedAt: true,
      expiresAt: true,
    },
  })

  if (
    !row ||
    row.purpose !== purpose ||
    row.usedAt ||
    row.expiresAt < new Date()
  ) {
    return null
  }

  return {
    id: row.id,
    clientId: row.clientId,
    organizationId: row.organizationId,
    purpose: row.purpose,
  }
}

/**
 * Marca como usado numa escrita condicional: `usedAt: null` no `where` faz o
 * banco arbitrar duas requisições simultâneas com o mesmo link, e a segunda
 * não encontra linha para atualizar.
 */
export async function consumeClientAccessToken(
  token: string,
  purpose: ClientTokenPurpose,
): Promise<ResolvedToken | null> {
  const resolved = await resolveClientAccessToken(token, purpose)

  if (!resolved) {
    return null
  }

  const { count } = await systemPrisma.clientAccessToken.updateMany({
    where: { id: resolved.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  return count === 1 ? resolved : null
}
