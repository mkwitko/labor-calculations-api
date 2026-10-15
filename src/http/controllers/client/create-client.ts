import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { requireOrganizationId } from '@/lib/tenant-context'
import { sendClientPortalInvite } from '@/services/client-portal/send-portal-invite'

export const createClient: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/clients',
    {
      preHandler: [auth],
      schema: {
        tags: ['Client'],
        summary: 'Create client',
        operationId: 'createClient',
        body: z.object({
          name: z.string().min(2),
          document: z.string().optional(),
          mail: z.string().email().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
        }),
        response: {
          201: z.object({
            id: z.string(),
            // Link de primeiro acesso ao portal. Volta na resposta para que o
            // escritório consiga entregá-lo por outro canal quando o e-mail
            // não existe ou não chega.
            inviteUrl: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      assertRole(request.tenant, 'owner', 'admin', 'lawyer', 'staff')
      const { name, document, mail, phone, notes } = request.body

      if (document) {
        const existing = await prisma.client.findFirst({
          where: { document, deletedAt: null },
          select: { id: true },
        })
        if (existing) {
          throw new ConflictException('Já existe um cliente com esse CPF')
        }
      }

      // Espelho do check de CPF. Dois clientes com o mesmo e-mail no mesmo
      // escritório quebram o login do portal: a escolha de escritório devolve o
      // mesmo nome duas vezes e escolher não desambigua.
      if (mail) {
        const existingMail = await prisma.client.findFirst({
          where: { mail, deletedAt: null },
          select: { id: true },
        })
        if (existingMail) {
          throw new ConflictException(
            'Já existe um cliente com esse e-mail neste escritório',
          )
        }
      }

      const organizationId = requireOrganizationId()

      const client = await prisma.client.create({
        data: {
          name,
          organizationId,
          document,
          mail,
          phone,
          notes,
          userId,
        },
        select: { id: true },
      })

      // O cliente nasce sem senha. A anterior eram os últimos cinco dígitos do
      // CPF — adivinhável por qualquer um que visse a inicial do processo. O
      // acesso agora vem de um link de uso único que a própria pessoa troca
      // por uma senha.
      const invite = mail
        ? await sendClientPortalInvite({ clientId: client.id, organizationId })
        : null

      return reply
        .status(201)
        .send({ id: client.id, inviteUrl: invite?.inviteUrl ?? null })
    },
  )
}
