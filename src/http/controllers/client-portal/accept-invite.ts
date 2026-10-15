import { hash } from 'argon2'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { systemPrisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { authenticateClient } from '@/services/client-portal/authenticate-client'
import {
  consumeClientAccessToken,
  resolveClientAccessToken,
} from '@/services/client-portal/client-access-token'
import { brandingForOrganization } from '@/services/tenant/organization-branding'

/**
 * Primeiro acesso do cliente ao portal. Rotas públicas: quem chega aqui ainda
 * não tem senha, então não há sessão a exigir. O token é a credencial, e vale
 * uma vez só.
 */
export const getPortalInvite: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/client-portal/invites/:token',
    {
      config: { rateLimit: { max: 20, timeWindow: '15 minute' } },
      schema: {
        tags: ['ClientPortal'],
        summary: 'Check a portal first-access link',
        operationId: 'getClientPortalInvite',
        params: z.object({ token: z.string().min(1) }),
        response: {
          200: z.object({
            clientName: z.string(),
            officeName: z.string(),
            logoUrl: z.string().nullable(),
            // Já existe conta de portal com este e-mail (qualquer escritório).
            // Quando true, a tela pede a senha que a pessoa já tem em vez de
            // uma nova, e o aceite vira `POST /invites/link`.
            hasOtherAccounts: z.boolean(),
            // Este cadastro já tem senha: o link não serve para nada e a tela
            // manda direto para o login.
            alreadyActive: z.boolean(),
          }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const resolved = await resolveClientAccessToken(
        request.params.token,
        'invite',
      )

      if (!resolved) {
        throw new BadRequestException(
          'Link inválido ou expirado. Peça um novo ao seu advogado.',
        )
      }

      const client = await systemPrisma.client.findFirst({
        where: { id: resolved.clientId, deletedAt: null },
        select: { id: true, name: true, mail: true, password: true },
      })

      if (!client) {
        throw new BadRequestException('Link inválido ou expirado')
      }

      const organization = await systemPrisma.organization.findUnique({
        where: { id: resolved.organizationId },
        select: { name: true },
      })

      const branding = await brandingForOrganization(resolved.organizationId)

      // A página é autenticada pelo token de uso único, então o aviso não conta
      // nada a terceiros: quem está aqui já recebeu o link do próprio e-mail.
      const otherAccount = client.mail
        ? await systemPrisma.client.findFirst({
            where: {
              mail: client.mail,
              id: { not: client.id },
              password: { not: null },
              deletedAt: null,
            },
            select: { id: true },
          })
        : null

      return reply.status(200).send({
        clientName: client.name,
        officeName: organization?.name ?? 'Seu advogado',
        logoUrl: branding?.logoUrl ?? null,
        hasOtherAccounts: otherAccount !== null,
        alreadyActive: client.password !== null,
      })
    },
  )
}

export const acceptPortalInvite: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/invites/accept',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minute' } },
      schema: {
        tags: ['ClientPortal'],
        summary: 'Set the portal password from a first-access link',
        operationId: 'acceptClientPortalInvite',
        body: z.object({
          token: z.string().min(1),
          password: z
            .string()
            .min(8, 'Senha deve ter no mínimo 8 caracteres')
            .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
            .regex(/\d/, 'Senha deve conter pelo menos um número'),
        }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body

      // Valida antes de consumir: recusa por CPF ou por conta já ativa não
      // pode queimar o link, senão o erro obriga a pedir outro convite.
      const client = await clientForInvite(token)

      if (client.document && password === client.document) {
        throw new BadRequestException('Senha não pode ser igual ao CPF')
      }

      if (!(await consumeClientAccessToken(token, 'invite'))) {
        throw new BadRequestException(
          'Link inválido ou expirado. Peça um novo ao seu advogado.',
        )
      }

      await systemPrisma.client.update({
        where: { id: client.id },
        data: {
          password: await hash(password),
          mustChangePassword: false,
          loginAttempts: 0,
          lockedUntil: null,
        },
      })

      return reply.status(200).send({
        message: 'Senha criada com sucesso. Você já pode entrar no portal.',
      })
    },
  )
}

/**
 * Ativa o cadastro com a senha que a pessoa **já** usa no portal de outro
 * escritório, em vez de pedir uma senha nova.
 *
 * A verificação vai por `authenticateClient` de propósito: é o mesmo caminho do
 * login, com contagem de tentativa e bloqueio de 15 minutos. Verificar a senha
 * aqui à mão transformaria o convite num oráculo de senha sem bloqueio — quem
 * tem o link tentaria à vontade contra a conta do outro escritório.
 *
 * A senha nova é o hash do que foi digitado, não uma cópia do hash irmão: o
 * resultado é o mesmo login em todos os escritórios (é o que alimenta o
 * `linked` do cookie), sem mover credencial entre cadastros.
 */
export const linkPortalInvite: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/invites/link',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minute' } },
      schema: {
        tags: ['ClientPortal'],
        summary:
          'Activate a first-access link with an existing portal password',
        operationId: 'linkClientPortalInvite',
        body: z.object({
          token: z.string().min(1),
          // Senha que já existe: validar força aqui recusaria a senha antiga de
          // quem a criou antes da regra atual.
          password: z.string().min(1),
        }),
        response: {
          200: z.object({ message: z.string() }),
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body

      const client = await clientForInvite(token)

      if (!client.mail) {
        throw new BadRequestException(
          'Este cadastro não tem e-mail. Escolha uma senha nova.',
        )
      }

      // Lança 400/401 quando a senha não bate em nenhuma conta do e-mail.
      await authenticateClient({ mail: client.mail, password })

      if (!(await consumeClientAccessToken(token, 'invite'))) {
        throw new BadRequestException(
          'Link inválido ou expirado. Peça um novo ao seu advogado.',
        )
      }

      await systemPrisma.client.update({
        where: { id: client.id },
        data: {
          password: await hash(password),
          mustChangePassword: false,
          loginAttempts: 0,
          lockedUntil: null,
        },
      })

      return reply.status(200).send({
        message: 'Acesso liberado. Entre com a senha que você já usa.',
      })
    },
  )
}

/**
 * Resolve o link **sem** consumir e recusa o cadastro que já tem senha: convite
 * reemitido para quem já acessa o portal não pode virar troca de senha às
 * cegas. Reset de senha tem token próprio (`purpose: 'reset'`).
 */
async function clientForInvite(token: string) {
  const resolved = await resolveClientAccessToken(token, 'invite')

  if (!resolved) {
    throw new BadRequestException(
      'Link inválido ou expirado. Peça um novo ao seu advogado.',
    )
  }

  const client = await systemPrisma.client.findFirst({
    where: { id: resolved.clientId, deletedAt: null },
    select: { id: true, document: true, mail: true, password: true },
  })

  if (!client) {
    throw new BadRequestException('Link inválido ou expirado')
  }

  if (client.password) {
    throw new BadRequestException(
      'Você já tem acesso ao portal com este e-mail. Entre com a sua senha ou use "esqueci minha senha".',
    )
  }

  return client
}
