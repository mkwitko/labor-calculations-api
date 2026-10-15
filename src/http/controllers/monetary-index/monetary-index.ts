import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { auth } from '@/http/hooks/auth'
import { requireAdmin } from '@/http/hooks/require-admin'
import { decimalField } from '@/http/schemas/zod-helpers'
import { syncMonetaryIndices } from '@/services/monetary-index/sync-monetary-indices'

const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM')

const indexSchema = z.object({
  month: z.date(),
  ipcaE: decimalField,
  ipcaECumulative: decimalField,
  selic: decimalField,
  selicCumulative: decimalField,
  trd: decimalField,
})

// Monetary correction indices (IPCA-E / SELIC / TR) used by the calculation
// engine. Editable so the office keeps them current without a code change.
export const monetaryIndexRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/monetary-indices',
    {
      preHandler: [auth],
      schema: {
        tags: ['MonetaryIndex'],
        summary: 'List monetary indices',
        operationId: 'listMonetaryIndices',
        response: { 200: z.array(indexSchema) },
      },
    },
    async (_request, reply) => {
      const rows = await prisma.monetaryIndex.findMany({
        orderBy: { month: 'desc' },
      })
      return reply.status(200).send(rows)
    },
  )

  app.put(
    '/monetary-indices/:month',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['MonetaryIndex'],
        summary: 'Create or update a monthly index (YYYY-MM)',
        operationId: 'upsertMonetaryIndex',
        params: z.object({ month: monthKey }),
        // Global indices affect every user's calculations → admin-only writes.
        body: z.object({
          ipcaE: z.number(),
          ipcaECumulative: z.number(),
          selic: z.number(),
          selicCumulative: z.number(),
          trd: z.number(),
        }),
        response: { 200: z.object({ month: z.string() }) },
      },
    },
    async (request, reply) => {
      const { month } = request.params
      const date = new Date(`${month}-01T00:00:00.000Z`)
      const b = request.body
      // Admin override → mark manual so the auto-sync never overwrites it.
      const data = { ...b, source: 'manual' }
      await prisma.monetaryIndex.upsert({
        where: { month: date },
        create: { month: date, ...data },
        update: data,
      })
      return reply.status(200).send({ month })
    },
  )

  app.delete(
    '/monetary-indices/:month',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['MonetaryIndex'],
        summary: 'Delete a monthly index',
        operationId: 'deleteMonetaryIndex',
        params: z.object({ month: monthKey }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { month } = request.params
      const date = new Date(`${month}-01T00:00:00.000Z`)
      await prisma.monetaryIndex.deleteMany({ where: { month: date } })
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/monetary-indices/sync',
    {
      preHandler: [auth, requireAdmin],
      schema: {
        tags: ['MonetaryIndex'],
        summary: 'Sync indices from Banco Central (SGS)',
        operationId: 'syncMonetaryIndices',
        response: {
          200: z.object({
            monthsUpserted: z.number(),
            skippedManual: z.number(),
            latestMonth: z.string().nullable(),
          }),
        },
      },
    },
    async (_request, reply) => {
      const result = await syncMonetaryIndices()
      return reply.status(200).send(result)
    },
  )
}
