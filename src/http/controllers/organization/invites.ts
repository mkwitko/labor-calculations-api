import type { OrgRole } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'
import { auth } from '@/http/hooks/auth'
import { assertCanAddMember } from '@/services/billing/plan-access'
import { sendEmail } from '@/services/email'
import { emailTemplates } from '@/services/email/templates'
import type { TenantActor } from '@/services/tenant/actor'
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteExpiryFrom,
} from '@/services/tenant/invite-token'
import {
  assertManageMembers,
  assertSameOrganization,
} from '@/services/tenant/organization-access'

/** `owner` fica fora: titularidade se move por transferência, não por convite. */
const INVITABLE_ROLE = z.enum(['admin', 'lawyer', 'staff', 'intern'])

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Titular',
  admin: 'Sócio',
  lawyer: 'Advogado associado',
  staff: 'Administrativo',
  intern: 'Estagiário',
}

function requireTenant(tenant: TenantActor | undefined): TenantActor {
  if (!tenant) throw new UnauthorizedException()

  return tenant
}

export const inviteRoutes: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/organizations/:organizationId/invites',
    {
      preHandler: [auth],
      config: {
        // Convite sai da plataforma como e-mail; teto baixo impede que a
        // organização seja usada como lista de disparo.
        rateLimit: { max: 20, timeWindow: '1 hour' },
      },
      schema: {
        tags: ['Organization'],
        summary: 'Invite someone to the organization',
        security: [{ BearerAuth: [] }],
        operationId: 'createInvite',
        params: z.object({ organizationId: z.string() }),
        body: z.object({
          email: z.string().email(),
          role: INVITABLE_ROLE,
        }),
        response: {
          201: z.object({
            data: z.object({
              id: z.string(),
              email: z.string(),
              role: INVITABLE_ROLE,
              expiresAt: z.date(),
              inviteUrl: z.string(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)
      assertManageMembers(tenant)

      // Caixa normalizada na entrada: o aceite compara o e-mail do convite com
      // o da conta, e duas grafias do mesmo endereço viram dois convites.
      const email = request.body.email.toLowerCase()
      const { role } = request.body

      const alreadyMember = await systemPrisma.membership.findFirst({
        where: {
          organizationId: tenant.organizationId,
          deletedAt: null,
          user: { mail: email },
        },
        select: { id: true },
      })

      if (alreadyMember) {
        throw new ConflictException('Essa pessoa já é membro da organização')
      }

      const pending = await systemPrisma.invite.findFirst({
        where: {
          organizationId: tenant.organizationId,
          email,
          status: 'pending',
        },
        select: { id: true },
      })

      if (pending) {
        throw new ConflictException(
          'Já existe convite pendente para esse e-mail',
        )
      }

      // Depois das checagens de duplicidade e antes de gastar um token: o teto
      // do plano é a última coisa que pode barrar o convite, e recusá-lo aqui
      // evita descobrir o estouro no aceite, quando o convidado já clicou no
      // link e leva um erro que não é dele.
      await assertCanAddMember(tenant.organizationId)

      const rawToken = generateInviteToken()

      const invite = await systemPrisma.invite.create({
        data: {
          organizationId: tenant.organizationId,
          email,
          role,
          tokenHash: hashInviteToken(rawToken),
          invitedById: tenant.userId,
          expiresAt: inviteExpiryFrom(new Date()),
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      })

      const inviteUrl = buildInviteUrl(rawToken)

      const [organization, inviter] = await Promise.all([
        systemPrisma.organization.findUniqueOrThrow({
          where: { id: tenant.organizationId },
          select: { name: true },
        }),
        systemPrisma.user.findUniqueOrThrow({
          where: { id: tenant.userId },
          select: { name: true },
        }),
      ])

      const template = emailTemplates.organizationInvite({
        organizationName: organization.name,
        inviterName: inviter.name,
        roleLabel: ROLE_LABELS[role],
        inviteUrl,
      })

      // Convite criado não se perde por falha do provedor de e-mail: o link
      // volta na resposta e quem convidou pode repassá-lo.
      try {
        await sendEmail({
          to: email,
          subject: template.subject,
          html: template.html,
        })
      } catch (error) {
        request.log.error({ err: error }, 'falha ao enviar convite por e-mail')
      }

      // O `inviteUrl` volta na resposta de propósito: quem cria é owner/admin,
      // já tem direito ao link, e "copiar link" é o caminho que funciona quando
      // o e-mail não chega. Depois daqui o token não é mais recuperável — o
      // banco só tem o hash.
      return reply.status(201).send({
        data: {
          id: invite.id,
          email: invite.email,
          role: INVITABLE_ROLE.parse(invite.role),
          expiresAt: invite.expiresAt,
          inviteUrl,
        },
      })
    },
  )

  app.get(
    '/organizations/:organizationId/invites',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'List pending invites',
        security: [{ BearerAuth: [] }],
        operationId: 'listInvites',
        params: z.object({ organizationId: z.string() }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                email: z.string(),
                role: z.enum(['owner', 'admin', 'lawyer', 'staff', 'intern']),
                expiresAt: z.date(),
                createdAt: z.date(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)
      assertManageMembers(tenant)

      const invites = await systemPrisma.invite.findMany({
        where: { organizationId: tenant.organizationId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      })

      return reply.status(200).send({ data: invites })
    },
  )

  app.delete(
    '/organizations/:organizationId/invites/:inviteId',
    {
      preHandler: [auth],
      schema: {
        tags: ['Organization'],
        summary: 'Revoke a pending invite',
        security: [{ BearerAuth: [] }],
        operationId: 'revokeInvite',
        params: z.object({
          organizationId: z.string(),
          inviteId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant)

      assertSameOrganization(tenant, request.params.organizationId)
      assertManageMembers(tenant)

      // `updateMany` com `organizationId` no `where` fecha o id cruzado numa só
      // query: convite de outro escritório não é encontrado, logo `count` 0.
      const { count } = await systemPrisma.invite.updateMany({
        where: {
          id: request.params.inviteId,
          organizationId: tenant.organizationId,
          status: 'pending',
        },
        data: { status: 'revoked' },
      })

      if (count === 0) {
        throw new ResourceNotFoundException('Convite não encontrado')
      }

      return reply.status(204).send()
    },
  )
}
