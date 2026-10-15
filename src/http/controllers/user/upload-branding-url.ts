import { randomUUID } from 'node:crypto'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { generateUploadUrl } from '@/lib/r2'

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

// Presigned upload for user branding assets (logo, letterhead). The stored
// public URL is built by the client as `${VITE_STORAGE_URL}/${fileKey}` and
// saved via the user update endpoints.
export const uploadBrandingUrl: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/user/branding/upload-url',
    {
      preHandler: [auth],
      schema: {
        tags: ['User'],
        summary: 'Get presigned upload URL for a branding asset',
        operationId: 'uploadBrandingUrl',
        body: z.object({
          asset: z.enum(['logo', 'letterhead']),
          mimeType: z.string(),
          sizeBytes: z.number().int().max(5_242_880),
        }),
        response: {
          200: z.object({ uploadUrl: z.string(), fileKey: z.string() }),
          400: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { asset, mimeType } = request.body

      const ext = EXTENSIONS[mimeType]
      if (!ext) {
        return reply.status(400).send({
          message: 'Formato não suportado. Use PNG, JPG, WEBP ou PDF.',
        })
      }

      const fileKey = `branding/${userId}/${asset}-${randomUUID()}.${ext}`
      const uploadUrl = await generateUploadUrl(fileKey, mimeType)

      return reply.status(200).send({ uploadUrl, fileKey })
    },
  )
}
