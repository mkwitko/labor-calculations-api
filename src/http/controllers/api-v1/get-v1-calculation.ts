import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { apiKeyAuth } from '@/http/hooks/api-key-auth'
import { buildApiCalculationView } from '@/services/api/api-calculation-view'
import { calculationView } from './create-v1-calculation'

export const getV1Calculation: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/v1/calculations/:id',
    {
      preHandler: [apiKeyAuth],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['ApiV1'],
        summary: 'Ler um cálculo',
        description: [
          'Relê um cálculo da própria organização — o mesmo corpo devolvido na',
          'criação, sem recalcular nada: os valores são os que foram gravados,',
          'com os índices vigentes naquele momento.',
          '',
          'Serve para o seu sistema não precisar guardar o resultado inteiro,',
          'só o `id`.',
          '',
          '**Cobrança:** leitura não cobra, em nenhum ambiente.',
          '',
          '**Limite:** 60 chamadas por minuto por chave.',
        ].join('\n'),
        operationId: 'getV1Calculation',
        security: [{ ApiKeyAuth: [] }],
        params: z.object({
          id: z.string().describe('Id devolvido na criação do cálculo.'),
        }),
        response: {
          200: calculationView.describe('Cálculo encontrado.'),
          401: z
            .object({ message: z.string() })
            .describe('Chave ausente, malformada ou revogada.'),
          402: z
            .object({ message: z.string() })
            .describe('Organização sem assinatura ativa.'),
          404: z
            .object({ message: z.string() })
            .describe(
              'Cálculo inexistente **ou** de outra organização: os dois casos respondem igual, para não confirmar a existência de dado alheio.',
            ),
        },
      },
    },
    async (request, reply) => {
      const view = await buildApiCalculationView(request.params.id)

      if (!view) {
        // A extension de tenant já filtrou por organização: cálculo de outra
        // organização simplesmente não existe daqui.
        throw new ResourceNotFoundException('Cálculo não encontrado')
      }

      return reply.status(200).send(view)
    },
  )
}
