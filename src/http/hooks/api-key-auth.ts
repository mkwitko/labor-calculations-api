import type { FastifyReply, FastifyRequest } from 'fastify'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { setActiveOrganization } from '@/lib/tenant-context'
import { resolveApiKey } from '@/services/api/api-key-service'
import { assertActiveSubscription } from './require-subscription'

/**
 * Autenticação das rotas `/v1`. **Não** é o `auth`: aquele manda todo
 * `Authorization: Bearer` para `jwtVerify` e, falhando, tenta refresh por
 * cookie — uma chave de API ali vira 401 confuso, depois de percorrer um
 * caminho que não tem nada a ver com integração.
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Chave de API inválida')
  }

  const key = await resolveApiKey(header.slice('Bearer '.length))

  setActiveOrganization(key.organizationId)

  // Organização sem assinatura ativa recebe 402, igual ao resto do app.
  await assertActiveSubscription(key.organizationId)

  request.apiKey = key
}
