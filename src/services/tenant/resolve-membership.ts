import type { OrgRole } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'

export type ActiveMembership = {
  organizationId: string
  role: OrgRole
}

/**
 * Resolve em qual organização o request age.
 *
 * Usa `systemPrisma` de propósito: esta é a consulta que estabelece o contexto
 * de tenant, então não pode depender dele.
 *
 * Sem `requestedOrganizationId` — token emitido antes do multi-org, ou
 * primeira sessão — cai na membership mais antiga. Determinístico e sem
 * escolha do usuário.
 */
export async function resolveActiveMembership(
  userId: string,
  requestedOrganizationId: string | undefined,
): Promise<ActiveMembership | null> {
  return systemPrisma.membership.findFirst({
    where: {
      userId,
      deletedAt: null,
      ...(requestedOrganizationId
        ? { organizationId: requestedOrganizationId }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true, role: true },
  })
}
