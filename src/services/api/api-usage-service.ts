import { prisma } from 'prisma/prisma'

/**
 * Uma linha por chamada cobrável. Só o cálculo que respondeu 2xx entra aqui:
 * erro de validação, 401, 402, 429 e leitura não cobram — o cliente não paga
 * pelo próprio bug nem por reler o que já comprou.
 */
export async function recordApiUsage(input: {
  organizationId: string
  apiKeyId: string
  endpoint: string
  calculationId?: string
}): Promise<void> {
  await prisma.apiUsage.create({
    data: {
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      endpoint: input.endpoint,
      calculationId: input.calculationId ?? null,
    },
  })
}
