import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertCanAcceptInvite } from '@/services/billing/plan-access'
import { syncExtraMembers } from '@/services/billing/sync-extra-members'
import { syncMemberCount } from '@/services/billing/sync-members'
import { demoteReferralIfSharedOrganization } from '@/services/referral/shared-organization'
import { hashInviteToken } from '@/services/tenant/invite-token'

const ROLE = z.enum(['owner', 'admin', 'lawyer', 'staff', 'intern'])

/**
 * Carrega o convite pelo token cru e valida estado antes de qualquer coisa.
 * Expirado é marcado como `expired` na passagem — o cron não precisa existir
 * para que a tabela conte a verdade sobre um convite que alguém tentou usar.
 */
async function loadPendingInvite(rawToken: string) {
  const invite = await systemPrisma.invite.findUnique({
    where: { tokenHash: hashInviteToken(rawToken) },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      organization: { select: { name: true } },
    },
  })

  if (!invite) {
    throw new ResourceNotFoundException('Convite não encontrado')
  }

  if (invite.status !== 'pending') {
    throw new ConflictException('Convite não está mais válido')
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    await systemPrisma.invite.update({
      where: { id: invite.id },
      data: { status: 'expired' },
    })

    throw new ConflictException('Convite expirado')
  }

  return invite
}

export const acceptInviteRoutes: FastifyPluginCallbackZod = (app) => {
  // Sem `auth`: a tela de aceite precisa mostrar de quem é o convite antes de
  // pedir login. Quem tem o token já recebeu o e-mail, então devolver o
  // endereço inteiro permite dizer "entre com fulano@x.com".
  app.get(
    '/invites/:token',
    {
      config: {
        rateLimit: { max: 30, timeWindow: '1 hour' },
      },
      schema: {
        tags: ['Organization'],
        summary: 'Read an invite by its token',
        operationId: 'getInvite',
        params: z.object({ token: z.string() }),
        response: {
          200: z.object({
            data: z.object({
              organizationName: z.string(),
              email: z.string(),
              role: ROLE,
              expiresAt: z.date(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const invite = await loadPendingInvite(request.params.token)

      return reply.status(200).send({
        data: {
          organizationName: invite.organization.name,
          email: invite.email,
          role: ROLE.parse(invite.role),
          expiresAt: invite.expiresAt,
        },
      })
    },
  )

  app.post(
    '/invites/accept',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Accept an invite',
        security: [{ BearerAuth: [] }],
        operationId: 'acceptInvite',
        body: z.object({ token: z.string() }),
        response: {
          201: z.object({
            data: z.object({
              organizationId: z.string(),
              role: ROLE,
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const invite = await loadPendingInvite(request.body.token)

      const user = await systemPrisma.user.findUniqueOrThrow({
        where: { id: request.user.sub },
        select: { mail: true },
      })

      // Sem esta conferência, token vazado é entrada livre no escritório:
      // qualquer conta autenticada aceitaria o convite de outra pessoa.
      if (invite.email !== user.mail.toLowerCase()) {
        throw new ForbiddenException('Convite emitido para outro e-mail')
      }

      const existing = await systemPrisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: request.user.sub,
            organizationId: invite.organizationId,
          },
        },
        select: { id: true, deletedAt: true },
      })

      if (existing && existing.deletedAt === null) {
        throw new ConflictException('Você já é membro dessa organização')
      }

      // Entre o envio do convite e este clique alguém pode ter entrado por
      // outro caminho e estourado o teto do plano.
      await assertCanAcceptInvite(invite.organizationId)

      // Pessoa removida e reconvidada: o `@@unique([userId, organizationId])`
      // barraria um insert, então a membership antiga é reativada com o papel
      // do convite novo.
      const upsertMembership = existing
        ? systemPrisma.membership.update({
            where: { id: existing.id },
            data: { role: invite.role, deletedAt: null },
          })
        : systemPrisma.membership.create({
            data: {
              userId: request.user.sub,
              organizationId: invite.organizationId,
              role: invite.role,
            },
          })

      await systemPrisma.$transaction([
        upsertMembership,
        systemPrisma.invite.update({
          where: { id: invite.id },
          data: { status: 'accepted', acceptedAt: new Date() },
        }),
      ])

      // Não protegido por try/catch: `syncMemberCount` não lança, e o número é
      // recalculado do zero na chamada seguinte.
      await syncMemberCount(invite.organizationId)
      // Entrou ou saiu gente: o excedente do teto é recalculado do zero.
      await syncExtraMembers(invite.organizationId)

      // As duas pessoas passaram a dividir escritório: uma indicação já
      // qualificada entre elas cai aqui. Sem isso, "indica primeiro, contrata
      // depois" é a rota de fuga da regra.
      await demoteReferralIfSharedOrganization(request.user.sub, new Date())

      // O aceite não reemite o JWT: quem aceitou continua na organização em que
      // estava. Arrastar a sessão para outro escritório sem pedir seria uma
      // troca de contexto silenciosa — ela se faz por
      // `POST /auth/switch-organization`.
      return reply.status(201).send({
        data: {
          organizationId: invite.organizationId,
          role: ROLE.parse(invite.role),
        },
      })
    },
  )
}
