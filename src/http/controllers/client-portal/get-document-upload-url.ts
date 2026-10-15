import { randomUUID } from 'node:crypto'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { clientAuth } from '@/http/hooks/client-auth'
import { generateUploadUrl } from '@/lib/r2'

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
}

const MAX_FILE_SIZE = 25 * 1024 * 1024

const UPLOAD_URL_EXPIRES_IN = 600

export const getDocumentUploadUrl: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/client-portal/documents/upload-url',
    {
      preHandler: [clientAuth],
      schema: {
        tags: ['ClientPortal'],
        summary: 'Generate signed URL for document upload',
        operationId: 'getDocumentUploadUrl',
        security: [{ BearerAuth: [] }],
        body: z.object({
          requirementId: z.string().cuid(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1),
          sizeBytes: z.number().min(1).max(MAX_FILE_SIZE),
        }),
        response: {
          200: z.object({
            uploadUrl: z.string(),
            fileKey: z.string(),
            expiresIn: z.number(),
          }),
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { requirementId, fileName, mimeType, sizeBytes } = request.body
      const clientId = request.user.sub

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new BadRequestException(
          'Tipo de arquivo não permitido. Use PDF, JPG, PNG, WEBP ou DOCX.',
        )
      }

      if (sizeBytes > MAX_FILE_SIZE) {
        throw new BadRequestException(
          'Arquivo muito grande. Tamanho máximo: 25MB.',
        )
      }

      const requirement = await prisma.documentRequirement.findFirst({
        where: {
          id: requirementId,
          case: {
            clientId: clientId,
            deletedAt: null,
          },
        },
        select: {
          id: true,
          caseId: true,
          status: true,
        },
      })

      if (!requirement) {
        throw new ResourceNotFoundException(
          'Requisito de documento não encontrado',
        )
      }

      const ext = EXTENSIONS[mimeType] ?? fileName.split('.').pop() ?? 'bin'
      const fileKey = `documents/${requirement.caseId}/${randomUUID()}.${ext}`

      const uploadUrl = await generateUploadUrl(
        fileKey,
        mimeType,
        UPLOAD_URL_EXPIRES_IN,
      )

      return reply.status(200).send({
        uploadUrl,
        fileKey,
        expiresIn: UPLOAD_URL_EXPIRES_IN,
      })
    },
  )
}
