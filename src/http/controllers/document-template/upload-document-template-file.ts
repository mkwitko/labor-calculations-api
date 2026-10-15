import { randomUUID } from 'node:crypto'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { assertRole } from '@/http/hooks/require-role'
import { generateUploadUrl } from '@/lib/r2'
import { requireOrganizationId } from '@/lib/tenant-context'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const uploadDocumentTemplateFile: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/document-templates/:id/upload-url',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Get presigned upload URL for template .docx file',
        operationId: 'uploadDocumentTemplateFile',
        params: z.object({ id: z.string() }),
        body: z.object({
          mimeType: z.literal(DOCX_MIME),
          sizeBytes: z.number().int().max(5_242_880),
        }),
        response: {
          200: z.object({ uploadUrl: z.string(), fileKey: z.string() }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      assertRole(request.tenant, 'owner', 'admin', 'lawyer')
      const { id } = request.params
      const { sizeBytes } = request.body

      const existing = await prisma.documentTemplate.findFirst({
        where: { id },
      })

      if (!existing) {
        throw new ResourceNotFoundException('Template não encontrado')
      }

      if (existing.isSystem) {
        return reply.status(400).send({
          message:
            'Templates do sistema não podem ser alterados. Duplique o template primeiro.',
        })
      }

      if (sizeBytes > 5_242_880) {
        return reply.status(400).send({ message: 'Arquivo excede 5MB' })
      }

      const fileKey = `templates/${id}/${randomUUID()}.docx`
      const uploadUrl = await generateUploadUrl(fileKey, DOCX_MIME)

      // Archive the previous committed file as a version before replacing it,
      // then bump currentVersion so the new upload becomes the active version.
      await prisma.$transaction(async (tx) => {
        if (existing.fileKey) {
          await tx.documentTemplateVersion.create({
            data: {
              templateId: id,
              organizationId: requireOrganizationId(),
              version: existing.currentVersion,
              fileKey: existing.fileKey,
            },
          })
        }
        await tx.documentTemplate.update({
          where: { id },
          data: {
            fileKey,
            currentVersion: existing.fileKey
              ? existing.currentVersion + 1
              : existing.currentVersion,
          },
        })
      })

      return reply.status(200).send({ uploadUrl, fileKey })
    },
  )
}
