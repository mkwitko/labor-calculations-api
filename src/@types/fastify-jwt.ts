import '@fastify/jwt'
import type { OrgRole } from '@prisma/client'

export interface FastifyJWTPayload {
  sub: string
  type?: string
  userId?: string
  mustChangePassword?: boolean
  isAdmin?: boolean
  org?: string
  /**
   * Portal: outras contas do mesmo e-mail cuja senha bateu neste login. Só elas
   * podem ser assumidas pelo `POST /client-portal/switch`. Cookie emitido antes
   * deste campo existir vale como lista vazia.
   */
  linked?: string[]
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: FastifyJWTPayload
    user: FastifyJWTPayload
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant: {
      userId: string
      organizationId: string
      role: OrgRole
    }
  }
}
