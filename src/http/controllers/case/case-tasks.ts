import { $Enums } from '@prisma/client'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { prisma } from 'prisma/prisma'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { auth } from '@/http/hooks/auth'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  assertCaseVisible,
  assertCaseWritable,
} from '@/services/tenant/case-access'

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.date().nullable(),
  status: z.enum($Enums.TaskStatus),
  priority: z.enum($Enums.TaskPriority),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
})

const createBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.coerce.date().optional(),
  priority: z.enum($Enums.TaskPriority).default('media'),
})

const updateBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueAt: z.coerce.date().nullish(),
  status: z.enum($Enums.TaskStatus).optional(),
  priority: z.enum($Enums.TaskPriority).optional(),
})

// CRUD for case tasks (to-dos). Status transition sets/clears completedAt.
export const caseTasksRoutes: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/cases/:caseId/tasks',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseTask'],
        summary: 'List case tasks',
        operationId: 'listCaseTasks',
        params: z.object({ caseId: z.string() }),
        response: { 200: z.array(taskSchema) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseVisible(request.tenant, caseId)
      const tasks = await prisma.caseTask.findMany({
        where: { caseId },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      })
      return reply.status(200).send(tasks)
    },
  )

  app.post(
    '/cases/:caseId/tasks',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseTask'],
        summary: 'Create case task',
        operationId: 'createCaseTask',
        params: z.object({ caseId: z.string() }),
        body: createBody,
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const { caseId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      const b = request.body
      const task = await prisma.caseTask.create({
        data: {
          caseId,
          organizationId: requireOrganizationId(),
          title: b.title,
          description: b.description ?? null,
          dueAt: b.dueAt ?? null,
          priority: b.priority,
        },
        select: { id: true },
      })
      return reply.status(201).send(task)
    },
  )

  app.patch(
    '/cases/:caseId/tasks/:taskId',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseTask'],
        summary: 'Update case task',
        operationId: 'updateCaseTask',
        params: z.object({ caseId: z.string(), taskId: z.string() }),
        body: updateBody,
        response: {
          200: z.object({ id: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { caseId, taskId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      const existing = await prisma.caseTask.findFirst({
        where: { id: taskId, caseId },
        select: { id: true, status: true },
      })
      if (!existing)
        throw new ResourceNotFoundException('Tarefa não encontrada')

      const b = request.body
      const completedAt =
        b.status === 'concluida' ? new Date() : b.status ? null : undefined

      await prisma.caseTask.update({
        where: { id: taskId },
        data: {
          title: b.title,
          description: b.description,
          dueAt: b.dueAt,
          status: b.status,
          priority: b.priority,
          completedAt,
        },
      })
      return reply.status(200).send({ id: taskId })
    },
  )

  app.delete(
    '/cases/:caseId/tasks/:taskId',
    {
      preHandler: [auth],
      schema: {
        tags: ['CaseTask'],
        summary: 'Delete case task',
        operationId: 'deleteCaseTask',
        params: z.object({ caseId: z.string(), taskId: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { caseId, taskId } = request.params
      await assertCaseWritable(request.tenant, caseId)
      await prisma.caseTask.deleteMany({ where: { id: taskId, caseId } })
      return reply.status(204).send(null)
    },
  )
}
