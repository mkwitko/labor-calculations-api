import Docxtemplater from 'docxtemplater'
import InspectModule from 'docxtemplater/js/inspect-module.js'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import PizZip from 'pizzip'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { getObjectBuffer } from '@/lib/r2'
import {
  getRequiredPlaceholders,
  VALID_PLACEHOLDERS,
} from '@/services/document/placeholder-registry'

function extractPlaceholdersFromTags(tags: Record<string, unknown>): string[] {
  const result: string[] = []
  for (const key of Object.keys(tags)) {
    const value = tags[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result.push(
        ...extractPlaceholdersFromTags(value as Record<string, unknown>),
      )
    } else {
      result.push(key)
    }
  }
  return result
}

export const validateDocumentTemplate: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/document-templates/:id/validate',
    {
      preHandler: [auth],
      schema: {
        tags: ['DocumentTemplate'],
        summary: 'Validate placeholders in a template .docx file',
        operationId: 'validateDocumentTemplate',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({
            valid: z.boolean(),
            placeholders: z.array(z.string()),
            invalidPlaceholders: z.array(z.string()),
            missingRequired: z.array(z.string()),
          }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const template = await prisma.documentTemplate.findFirst({
        where: { id },
      })

      if (!template || !template.fileKey) {
        throw new ResourceNotFoundException(
          'Template não encontrado ou sem arquivo',
        )
      }

      const buffer = await getObjectBuffer(template.fileKey)
      const iModule = new InspectModule()
      const zip = new PizZip(buffer)
      new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
        modules: [iModule],
      })

      const allTags = iModule.getAllTags()
      const placeholders = [...new Set(extractPlaceholdersFromTags(allTags))]

      const invalidPlaceholders = placeholders.filter(
        (p) => !VALID_PLACEHOLDERS.has(p),
      )

      const requiredForType = getRequiredPlaceholders(template.type)
      const missingRequired = requiredForType.filter(
        (p) => !placeholders.includes(p),
      )

      const valid =
        invalidPlaceholders.length === 0 &&
        missingRequired.length === 0 &&
        placeholders.length > 0

      return reply.status(200).send({
        valid,
        placeholders,
        invalidPlaceholders,
        missingRequired,
      })
    },
  )
}
