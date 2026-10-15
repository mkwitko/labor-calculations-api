import { randomUUID } from 'node:crypto'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { copyObject } from '@/lib/r2'
import { requireOrganizationId } from '@/lib/tenant-context'

export const duplicateDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/document-templates/:id/duplicate',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary:
          'Duplicate a system template as a custom template for the user',
        operationId: 'duplicateDocumentTemplate',
        params: z.object({ id: z.string() }),
        body: z
          .object({
            name: z.string().min(1).optional(),
          })
          .optional(),
        response: {
          201: z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            fileKey: z.string().nullable(),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params
      const { name } = request.body ?? {}

      const source = await prisma.documentTemplate.findFirst({
        where: {
          id,
        },
      })

      if (!source) {
        throw new ResourceNotFoundException('Template não encontrado')
      }

      let fileKey: string | null = null

      if (source.fileKey) {
        fileKey = `templates/${source.type}/${randomUUID()}.docx`
        await copyObject(source.fileKey, fileKey)
      }

      const duplicate = await prisma.documentTemplate.create({
        data: {
          userId,
          organizationId: requireOrganizationId(),
          name: name ?? `${source.name} (cópia)`,
          description: source.description,
          type: source.type,
          isSystem: false,
          fileKey,
        },
        select: {
          id: true,
          name: true,
          type: true,
          fileKey: true,
        },
      })

      return reply.status(201).send(duplicate)
    },
  )
}
