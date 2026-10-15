import type { OrgRole } from '@prisma/client'

/**
 * Quem age no request, já resolvido pelo hook de auth: a pessoa, a organização
 * em que ela age agora e o papel dela ali. É o mesmo shape de
 * `request.tenant` — existe como tipo nomeado para que serviço e helper não
 * precisem importar `FastifyRequest` só para tipar um parâmetro.
 */
export type TenantActor = {
  userId: string
  organizationId: string
  role: OrgRole
}
