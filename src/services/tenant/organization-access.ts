import type { OrgRole } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import type { TenantActor } from './actor'
import { canManageMembers } from './visibility'

/**
 * `Membership`, `Invite` e `Organization` são non-tenant — a extension não
 * injeta `organizationId` neles. Logo todo filtro de organização aqui é
 * explícito, e é isso que estas funções centralizam.
 */

/**
 * O `:organizationId` da URL é conveniência de desenho de API — a organização
 * efetiva do request vem do token, resolvida em `auth`. Divergência entre as
 * duas é 404: um 403 confirmaria que aquela organização existe.
 */
export function assertSameOrganization(
  tenant: TenantActor,
  organizationId: string,
): void {
  if (tenant.organizationId !== organizationId) {
    throw new ResourceNotFoundException('Organização não encontrada')
  }
}

/** Gestão de gente: listar, convidar, mudar papel, remover. */
export function assertManageMembers(tenant: TenantActor): void {
  if (!canManageMembers(tenant.role)) {
    throw new ForbiddenException(
      'Seu papel na organização não permite gerenciar membros',
    )
  }
}

/**
 * Sem o `organizationId` no `where`, um id de membership de outro escritório
 * seria alcançável — `Membership` é non-tenant, ninguém filtra por baixo.
 */
export async function findActiveMembership(
  organizationId: string,
  membershipId: string,
): Promise<{ id: string; userId: string; role: OrgRole } | null> {
  return systemPrisma.membership.findFirst({
    where: { id: membershipId, organizationId, deletedAt: null },
    select: { id: true, userId: true, role: true },
  })
}
