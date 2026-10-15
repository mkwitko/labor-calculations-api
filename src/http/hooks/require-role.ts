import type { OrgRole } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import type { TenantActor } from '@/services/tenant/actor'

/**
 * Papel insuficiente é 403, não 404: a rota existe, o recurso é da organização
 * do requisitante e a resposta pode dizer isso. O 404 fica reservado ao que o
 * papel não enxerga — ver `assertCaseVisible`.
 */
export function assertRole(tenant: TenantActor, ...roles: OrgRole[]): void {
  if (!roles.includes(tenant.role)) {
    throw new ForbiddenException(
      `Ação restrita aos papéis: ${roles.join(', ')}`,
    )
  }
}

/**
 * Versão preHandler, para gatear a rota inteira. Roda depois de `auth` na
 * mesma lista de preHandlers — é `auth` quem popula `request.tenant`.
 *
 * Quando só parte do payload é restrita (o caso de `update-user`, em que o
 * bloco de marca do escritório é de owner/admin e o resto é da própria
 * pessoa), use `assertRole` em linha em vez deste.
 */
export function requireRole(...roles: OrgRole[]) {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    if (!request.tenant) {
      throw new UnauthorizedException()
    }

    assertRole(request.tenant, ...roles)
  }
}
