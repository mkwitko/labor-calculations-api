import { prisma, systemPrisma } from 'prisma/prisma'
import type { LaborCalculationInputV3 } from '@/@types/labor-calculation-v3'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { sendClientPortalInvite } from '@/services/client-portal/send-portal-invite'
import { createLaborCalculationV3Service } from '@/services/labor-calculation/labor-calculation-v3-service'
import { hashInviteToken } from '@/services/tenant/invite-token'
import {
  claimObservation,
  verbaInputToV3,
} from '@/services/verba-calculation/verba-input-to-v3'

type ClaimResult = {
  calculationId: string
  clientId: string
  /** Falso quando a organização já tinha importado este cálculo antes. */
  created: boolean
  /**
   * Link de primeiro acesso ao portal, quando o convite foi emitido nesta
   * importação. Nulo quando o advogado dispensou o convite ou quando o cliente
   * reaproveitado já tem senha — reemitir convite de primeiro acesso a quem já
   * entra no portal derrubaria o acesso dele.
   */
  portalInviteUrl: string | null
  portalEmailSent: boolean
}

/**
 * As datas voltam do JSON como string. O motor e o Prisma esperam `Date`, e um
 * `new Date(undefined)` vira `Invalid Date` silencioso — daí a checagem.
 */
function reviveDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined
  const date = new Date(value as string)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function reviveInput(raw: unknown): LaborCalculationInputV3 {
  const input = raw as LaborCalculationInputV3

  const startDate = reviveDate(input.startDate)
  const endDate = reviveDate(input.endDate)

  if (!startDate || !endDate) {
    throw new ResourceNotFoundException('Cálculo não encontrado ou expirado')
  }

  return {
    ...input,
    startDate,
    endDate,
    priorNoticeDate: reviveDate(input.priorNoticeDate),
    filingDate: reviveDate(input.filingDate),
    liquidationDate: reviveDate(input.liquidationDate),
  }
}

/**
 * Traz para dentro do escritório um cálculo feito na calculadora pública.
 *
 * Quem chega aqui é o advogado que recebeu o link do próprio consumidor — não
 * há lista de advogados nem encaminhamento: a escolha do destinatário é de quem
 * calculou. Ver `share-with-lawyer.tsx` no front.
 */
type ClaimParams = {
  userId: string
  organizationId: string
  /**
   * Convidar o consumidor para o portal na mesma operação. Ligado por padrão:
   * é o momento em que o acesso passa a servir para alguma coisa — antes de ter
   * advogado, não havia escritório onde o cliente pudesse morar.
   */
  invitePortal?: boolean
}

export async function claimPublicCalculation(
  params: ClaimParams & { token: string },
): Promise<ClaimResult> {
  const row = await systemPrisma.publicCalculation.findUnique({
    where: { tokenHash: hashInviteToken(params.token) },
  })

  return claimRow(row, params)
}

/**
 * Importa um cálculo que nasceu no widget do próprio escritório.
 *
 * Aqui não há token: o link do resultado ficou com o visitante do site, e o
 * escritório vê a linha na própria lista. A autorização é ser dono do widget
 * que gerou o cálculo — 404 quando não é, nunca 403, para não confirmar a
 * existência de cálculo alheio.
 */
export async function claimWidgetCalculation(
  params: ClaimParams & { publicCalculationId: string },
): Promise<ClaimResult> {
  const row = await systemPrisma.publicCalculation.findFirst({
    where: {
      id: params.publicCalculationId,
      widgetOrganizationId: params.organizationId,
    },
  })

  return claimRow(row, params)
}

async function claimRow(
  row: Awaited<
    ReturnType<typeof systemPrisma.publicCalculation.findUnique>
  > | null,
  params: ClaimParams,
): Promise<ClaimResult> {
  if (!row || row.expiresAt <= new Date()) {
    throw new ResourceNotFoundException('Cálculo não encontrado ou expirado')
  }

  if (row.claimedByOrganizationId) {
    // Mesma organização: dois cliques não podem virar dois clientes.
    if (
      row.claimedByOrganizationId === params.organizationId &&
      row.clientId &&
      row.laborCalculationId
    ) {
      return {
        calculationId: row.laborCalculationId,
        clientId: row.clientId,
        created: false,
        portalInviteUrl: null,
        portalEmailSent: false,
      }
    }

    throw new ConflictException(
      'Este cálculo já foi importado por outro escritório',
    )
  }

  // Cálculo de verba isolada não tem a forma de um input de liquidação: um
  // adaptador o converte, para a importação seguir com um caminho só.
  const input = verbaInputToV3(row.kind, row.input) ?? reviveInput(row.input)

  // Cliente que já existe com o mesmo e-mail é reaproveitado: o consumidor pode
  // ter calculado duas vezes, e o escritório não quer dois cadastros dele.
  const existingClient = row.email
    ? await prisma.client.findFirst({ where: { mail: row.email } })
    : null

  const client =
    existingClient ??
    (await prisma.client.create({
      data: {
        name: row.name ?? 'Cliente da calculadora',
        mail: row.email,
        phone: row.phone,
        userId: params.userId,
        organizationId: params.organizationId,
      },
    }))

  const calculation = await createLaborCalculationV3Service(
    params.userId,
    {
      ...input,
      clientId: client.id,
      clientName: client.name,
      observations: claimObservation(row.kind),
    },
    { indexSnapshotId: row.indexSnapshotId ?? undefined },
  )

  await systemPrisma.publicCalculation.update({
    where: { id: row.id },
    data: {
      claimedByOrganizationId: params.organizationId,
      claimedAt: new Date(),
      clientId: client.id,
      laborCalculationId: calculation.id,
    },
  })

  // Cliente reaproveitado que já tem senha usa o portal hoje: emitir convite de
  // primeiro acesso invalidaria os convites pendentes dele sem necessidade.
  const alreadyHasAccess = Boolean(existingClient?.password)
  const shouldInvite = params.invitePortal !== false && !alreadyHasAccess

  const portal = shouldInvite
    ? await sendClientPortalInvite({
        clientId: client.id,
        organizationId: params.organizationId,
      })
    : null

  return {
    calculationId: calculation.id,
    clientId: client.id,
    created: true,
    portalInviteUrl: portal?.inviteUrl ?? null,
    portalEmailSent: portal?.emailSent ?? false,
  }
}
