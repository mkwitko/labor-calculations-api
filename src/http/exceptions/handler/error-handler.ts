import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { env } from '@/env'
import { captureException } from '@/lib/sentry'
import { HttpException } from '../http-exception'
import { handlePrismaError } from './prisma-error-handler'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof HttpException) {
    request.errorContext = { message: error.message, code: error.code }
    return reply.status(error.statusCode).send({
      message: error.message,
      showError: error.showError,
    })
  }

  if (error.code?.startsWith('P')) {
    const message = handlePrismaError(error)
    request.errorContext = { message, code: error.code }
    return reply.status(400).send({ message, showError: false })
  }

  const statusCode = error.statusCode ?? 500
  const message =
    env.ENV === 'production' && statusCode === 500
      ? 'Ocorreu um erro interno. Por favor, tente novamente.'
      : error.message

  request.errorContext = { message, code: error.code }

  if (statusCode >= 500) {
    const userId = (request.user as { sub: string } | undefined)?.sub ?? null
    console.error('Unhandled server error', {
      requestId: request.id,
      sessionId: request.headers['x-session-id'] ?? null,
      method: request.method,
      path: request.url.split('?')[0],
      userId,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    })
    captureException(error, {
      requestId: request.id,
      sessionId: request.headers['x-session-id'] ?? null,
      method: request.method,
      path: request.url.split('?')[0],
      userId,
    })
  }

  return reply.status(statusCode).send({
    message,
    showError: false,
  })
}
