import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { apiKeyAuth } from '@/http/hooks/api-key-auth'
import { createLaborCalculationV3Body } from '@/http/schemas/labor-calculation-schema'
import { buildApiCalculationView } from '@/services/api/api-calculation-view'
import { recordApiUsage } from '@/services/api/api-usage-service'
import { createLaborCalculationV3Service } from '@/services/labor-calculation/labor-calculation-v3-service'

export const calculationView = z
  .object({
    id: z
      .string()
      .describe(
        'Id do cálculo. É por ele que GET /v1/calculations/{id} relê o resultado.',
      ),
    engineVersion: z
      .string()
      .nullable()
      .describe(
        'Versão do motor que produziu o resultado. Guarde junto do seu registro: é o que explica por que dois cálculos do mesmo contrato podem divergir.',
      ),
    indexSnapshotHash: z
      .string()
      .nullable()
      .describe(
        'Hash do conjunto de índices (IPCA-E, SELIC, TR) usado na correção. Mesmo hash, mesmo resultado.',
      ),
    totals: z
      .object({
        brutoDevidoReclamante: z
          .string()
          .describe('Total devido antes das deduções, em reais.'),
        liquidoDevidoReclamante: z
          .string()
          .describe(
            'Total devido depois de INSS, IRPF e dos valores já pagos, em reais.',
          ),
      })
      .describe(
        'Totais do cálculo. Decimais vêm como string, sem separador de milhar.',
      ),
    verbas: z
      .array(
        z.object({
          name: z.string().describe('Nome da verba (ex.: "Aviso Prévio").'),
          legalRef: z
            .string()
            .nullable()
            .describe(
              'Fundamento legal da verba (ex.: "CLT art. 487"). Nulo quando a verba não tem base própria.',
            ),
          bruto: z.string().describe('Valor original da verba, em reais.'),
          corrigido: z
            .string()
            .describe('Valor após correção monetária, em reais.'),
          juros: z.string().describe('Juros da verba, em reais.'),
          total: z.string().describe('Corrigido mais juros, em reais.'),
        }),
      )
      .describe(
        'Memória de cálculo: uma linha por verba, com fundamento legal, correção e juros. É o que permite mostrar a conta aberta para o cliente.',
      ),
  })
  .describe(
    'Resultado da liquidação: totais, memória por verba e a procedência (versão do motor e índices).',
  )

export const createV1Calculation: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/v1/calculations/liquidacao',
    {
      preHandler: [apiKeyAuth],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['ApiV1'],
        summary: 'Calcular liquidação trabalhista',
        description: [
          'Calcula a liquidação de um contrato de trabalho com o mesmo motor',
          'que o LexLaboral usa internamente: verbas rescisórias, adicionais,',
          'FGTS, correção monetária pelos índices oficiais, juros, INSS e IRPF.',
          '',
          'A resposta traz a **memória de cálculo verba por verba**, com o',
          'fundamento legal de cada uma, e a procedência do resultado (versão do',
          'motor e hash do conjunto de índices).',
          '',
          'O cálculo é **persistido**: fica na lista de cálculos da organização,',
          'sob a pessoa que emitiu a chave, e pode ser relido por',
          '`GET /v1/calculations/{id}`.',
          '',
          '**Cobrança:** cada resposta 201 com chave `jp_live_` é uma chamada',
          'cobrada. Erro não cobra, e chave `jp_test_` nunca cobra.',
          '',
          '**Limite:** 60 chamadas por minuto por chave.',
        ].join('\n'),
        operationId: 'createV1Calculation',
        security: [{ ApiKeyAuth: [] }],
        body: createLaborCalculationV3Body,
        response: {
          201: calculationView.describe(
            'Cálculo criado. Esta é a única resposta que gera cobrança.',
          ),
          400: z
            .object({ message: z.string() })
            .describe(
              'Corpo inválido: a mensagem diz qual campo. Não é cobrado.',
            ),
          401: z
            .object({ message: z.string() })
            .describe(
              'Chave ausente, malformada ou revogada. A mensagem é a mesma nos três casos, de propósito.',
            ),
          402: z
            .object({ message: z.string() })
            .describe(
              'Organização sem assinatura ativa. A API pública é do plano Max.',
            ),
        },
      },
    },
    async (request, reply) => {
      // `apiKeyAuth` garante o campo; o `?` existe só porque o tipo é global.
      const apiKey = request.apiKey
      if (!apiKey) throw new Error('apiKeyAuth não preencheu request.apiKey')

      const calculation = await createLaborCalculationV3Service(
        apiKey.createdById,
        request.body,
      )

      const view = await buildApiCalculationView(calculation.id)

      if (!view) {
        // Só aconteceria se o cálculo sumisse entre a criação e a leitura.
        // Falhar aqui é melhor que responder um corpo vazio ao integrador.
        throw new Error(
          `Cálculo ${calculation.id} não encontrado logo após ser criado`,
        )
      }

      // Depois de o cálculo dar certo e antes de responder: falha aqui derruba
      // a chamada de propósito. Cobrar errado é pior que falhar visivelmente, e
      // o cliente repete.
      //
      // Chave de teste calcula igual e não cobra: é o que permite escrever a
      // integração sem pagar por tentativa.
      if (apiKey.mode === 'live') {
        await recordApiUsage({
          organizationId: apiKey.organizationId,
          apiKeyId: apiKey.id,
          endpoint: 'POST /v1/calculations/liquidacao',
          calculationId: calculation.id,
        })
      }

      return reply.status(201).send(view)
    },
  )
}
