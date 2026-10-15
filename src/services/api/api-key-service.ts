import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import {
  ensureApiUsageItem,
  stripeUsageItem,
  type UsageItemPort,
} from './ensure-usage-item'

export const API_KEY_TOKEN_PREFIX = 'jp_live_'
export const API_KEY_TEST_PREFIX = 'jp_test_'

export type ApiKeyMode = 'live' | 'test'

export type IssuedApiKey = {
  id: string
  name: string
  prefix: string
  mode: ApiKeyMode
  /** Token completo. Existe só nesta resposta — nunca no banco, nunca de novo. */
  token: string
}

export type ResolvedApiKey = {
  id: string
  organizationId: string
  createdById: string
  /** `test` não gera `ApiUsage`: quem decide isso é o controller. */
  mode: ApiKeyMode
}

/**
 * sha256 sem salt, como `invite-token.ts`: o segredo tem 32 bytes de entropia,
 * então não há dicionário a resistir, e o hash existe para que um dump da
 * tabela não vire credencial. Argon2 é caro de propósito e aqui rodaria em
 * toda chamada da API.
 */
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function generatePrefix(mode: ApiKeyMode): string {
  const prefix = mode === 'test' ? API_KEY_TEST_PREFIX : API_KEY_TOKEN_PREFIX

  return `${prefix}${randomBytes(8).toString('hex')}`
}

function generateSecret(): string {
  return randomBytes(32).toString('base64url')
}

export async function issueApiKey(
  input: {
    organizationId: string
    createdById: string
    name: string
    /** Ausente é produção: integração que já existe continua cobrando. */
    mode?: ApiKeyMode
  },
  usageItem: UsageItemPort = stripeUsageItem,
): Promise<IssuedApiKey> {
  const mode = input.mode ?? 'live'
  const prefix = generatePrefix(mode)
  const secret = generateSecret()

  const created = await systemPrisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      name: input.name,
      mode,
      prefix,
      secretHash: hashSecret(secret),
    },
    select: { id: true, name: true, prefix: true, mode: true },
  })

  // Criar chave é o ato de optar por uso pago, então é aqui que a assinatura
  // ganha o item medido. Best-effort de propósito: Stripe fora do ar não pode
  // impedir a emissão, e o reporte diário garante o item depois.
  try {
    await ensureApiUsageItem(
      input.organizationId,
      env.STRIPE_PRICE_ID_API,
      usageItem,
    )
  } catch (error) {
    console.error('Falha ao anexar item de uso medido à assinatura', {
      organizationId: input.organizationId,
      error,
    })
  }

  return { ...created, token: `${prefix}.${secret}` }
}

/**
 * Recusa sempre com a mesma mensagem: distinguir "não existe" de "revogada"
 * entregaria informação a quem está sondando.
 */
export async function resolveApiKey(token: string): Promise<ResolvedApiKey> {
  const [prefix, secret] = token.split('.')
  const knownPrefix =
    prefix?.startsWith(API_KEY_TOKEN_PREFIX) ||
    prefix?.startsWith(API_KEY_TEST_PREFIX)

  if (!knownPrefix || !secret) {
    throw new UnauthorizedException('Chave de API inválida')
  }

  const key = await systemPrisma.apiKey.findUnique({
    where: { prefix },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      mode: true,
      secretHash: true,
      revokedAt: true,
    },
  })

  if (!key || key.revokedAt) {
    throw new UnauthorizedException('Chave de API inválida')
  }

  const expected = Buffer.from(key.secretHash, 'hex')
  const received = Buffer.from(hashSecret(secret), 'hex')

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new UnauthorizedException('Chave de API inválida')
  }

  // Best-effort: saber a última utilização não vale atrasar a resposta nem
  // derrubar a chamada.
  systemPrisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch((error) => {
      console.error('Falha ao gravar lastUsedAt da chave de API', error)
    })

  return {
    id: key.id,
    organizationId: key.organizationId,
    createdById: key.createdById,
    mode: key.mode,
  }
}

export async function listApiKeys(organizationId: string) {
  return systemPrisma.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      mode: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })
}

/** Revogar preenche `revokedAt`: `ApiUsage` continua apontando para a chave. */
export async function revokeApiKey(input: {
  organizationId: string
  apiKeyId: string
}): Promise<void> {
  const found = await systemPrisma.apiKey.findFirst({
    where: { id: input.apiKeyId, organizationId: input.organizationId },
    select: { id: true },
  })

  if (!found) {
    throw new ResourceNotFoundException('Chave não encontrada')
  }

  await systemPrisma.apiKey.update({
    where: { id: found.id },
    data: { revokedAt: new Date() },
  })
}
