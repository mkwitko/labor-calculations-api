import { systemPrisma as prisma } from 'prisma/prisma'
import { sendEmail } from '@/services/email'
import {
  type DataJudMovement,
  datajudAliasFor,
  fetchDataJudMovements,
} from './datajud-service'

/**
 * Sincronização periódica de andamentos com a base pública do CNJ.
 *
 * Antes disto, andamento só chegava quando alguém abria o caso e clicava em
 * "sincronizar" — ou seja, o acompanhamento dependia de o advogado desconfiar
 * de que algo tinha acontecido. Aqui a varredura é do sistema, e o advogado
 * recebe um e-mail quando o processo dele efetivamente andou.
 *
 * Três cuidados moldam o desenho:
 *
 * 1. **A API do CNJ tem limite de requisições.** Por isso a fila é atendida em
 *    rodízio (`lastMovementSyncAt`), com teto por rodada e uma pausa entre as
 *    chamadas — varrer a base inteira toda noite derrubaria a integração para
 *    todo mundo.
 * 2. **A base do DataJud é um espelho com atraso.** Rodar de hora em hora não
 *    traria nada novo; uma vez por dia é a granularidade que o dado tem.
 * 3. **Falha de um caso não pode parar a fila.** Erro é contado, registrado e
 *    a varredura segue — inclusive marcando o caso como visto, senão o caso
 *    problemático voltaria ao topo da fila em toda rodada.
 */

/** Casos consultados por rodada. Bem abaixo do limite da API pública do CNJ. */
const CASES_PER_RUN = 200

/** Pausa entre chamadas ao DataJud, para não disparar rajada. */
const DELAY_BETWEEN_CALLS_MS = 250

/** Statuses do Stripe em que a organização continua sendo atendida. */
const BILLABLE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid']

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

type NewMovement = {
  caseId: string
  caseTitle: string
  processNumber: string
  date: Date
  description: string
}

type Recipient = { mail: string; name: string; items: NewMovement[] }

/**
 * De onde vêm os andamentos. Injetável porque o teste não pode depender da API
 * do CNJ responder — e porque `vi.mock` não serve aqui: o alias de teste deste
 * repo duplica instâncias de módulo.
 */
export type MovementsPort = (
  processNumber: string,
) => Promise<DataJudMovement[]>

export type MovementSyncResult = {
  /** Casos consultados nesta rodada. */
  checked: number
  /** Andamentos novos gravados. */
  imported: number
  /** Advogados avisados por e-mail. */
  notified: number
  /** Consultas que falharam (DataJud fora do ar, número recusado). */
  failed: number
}

/**
 * A fila da rodada: caso ativo, com número de processo da Justiça do Trabalho,
 * de organização que ainda está pagando (ou em teste). Quem nunca foi
 * sincronizado vem primeiro; depois, o mais antigo.
 */
async function pickCases(limit: number) {
  const cases = await prisma.case.findMany({
    where: {
      deletedAt: null,
      closedAt: null,
      processNumber: { not: null },
      OR: [
        {
          organization: { subscription: { status: { in: BILLABLE_STATUSES } } },
        },
        {
          organization: {
            subscription: { is: null },
            trialEndsAt: { gt: new Date() },
          },
        },
      ],
    },
    // `nulls: 'first'` é o que faz o caso recém-criado entrar na frente em vez
    // de ficar no fim de uma ordenação que trata NULL como o maior valor.
    orderBy: { lastMovementSyncAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: {
      id: true,
      title: true,
      processNumber: true,
      organizationId: true,
      assignedTo: { select: { id: true, mail: true, name: true } },
    },
  })

  // O alias só existe para a Justiça do Trabalho. Filtrar aqui evita gastar uma
  // vaga da rodada com um número que a consulta recusaria de qualquer forma.
  return cases.filter((item) =>
    item.processNumber ? datajudAliasFor(item.processNumber) !== null : false,
  )
}

async function importMovements(
  caseId: string,
  organizationId: string,
  movements: DataJudMovement[],
): Promise<DataJudMovement[]> {
  if (movements.length === 0) return []

  // Quais já existem — precisamos saber **quais** são novos, e não só quantos,
  // para o e-mail listar o que de fato aconteceu. `createMany` devolve contagem.
  const known = await prisma.caseMovement.findMany({
    where: {
      caseId,
      externalId: { in: movements.map((movement) => movement.externalId) },
    },
    select: { externalId: true },
  })

  const seen = new Set(known.map((row) => row.externalId))
  const fresh = movements.filter((movement) => !seen.has(movement.externalId))

  if (fresh.length === 0) return []

  await prisma.caseMovement.createMany({
    data: fresh.map((movement) => ({
      caseId,
      organizationId,
      date: movement.date,
      code: movement.code,
      description: movement.description,
      source: 'datajud' as const,
      externalId: movement.externalId,
    })),
    skipDuplicates: true,
  })

  return fresh
}

function buildEmailHtml(name: string, items: NewMovement[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb">
            <strong>${item.description}</strong><br/>
            <span style="color:#6b7280;font-size:14px">${item.caseTitle} · ${item.processNumber}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">
            ${formatDate(item.date)}
          </td>
        </tr>`,
    )
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <h2 style="margin-bottom:4px">Movimentação nos seus processos</h2>
      <p style="color:#6b7280;margin-top:0">Olá, ${name}! O tribunal publicou novos andamentos:</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin-top:24px;font-size:13px;color:#9ca3af">
        Andamentos vindos da base pública do CNJ (DataJud), que é atualizada pelos
        tribunais com alguma defasagem. Confira sempre nos autos.
      </p>
    </div>
  `
}

async function notify(recipients: Map<string, Recipient>): Promise<number> {
  const sends = Array.from(recipients.values()).map(({ mail, name, items }) =>
    sendEmail({
      to: mail,
      subject:
        items.length === 1
          ? 'LexLaboral — 1 novo andamento'
          : `LexLaboral — ${items.length} novos andamentos`,
      html: buildEmailHtml(name, items),
    })
      .then(() => true)
      .catch((err) => {
        console.error('Failed to send movement email', { mail, error: err })
        return false
      }),
  )

  const results = await Promise.all(sends)

  return results.filter(Boolean).length
}

export async function runCaseMovementSync(options?: {
  limit?: number
  fetchMovements?: MovementsPort
  /** Pausa entre chamadas; o teste zera para não esperar por nada. */
  delayMs?: number
}): Promise<MovementSyncResult> {
  const limit = options?.limit ?? CASES_PER_RUN
  const fetchMovements = options?.fetchMovements ?? fetchDataJudMovements
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_CALLS_MS
  const cases = await pickCases(limit)

  const recipients = new Map<string, Recipient>()
  let imported = 0
  let failed = 0

  for (const item of cases) {
    const processNumber = item.processNumber as string

    try {
      const movements = await fetchMovements(processNumber)
      const fresh = await importMovements(
        item.id,
        item.organizationId,
        movements,
      )

      imported += fresh.length

      if (fresh.length > 0) {
        const lawyer = item.assignedTo
        const bucket = recipients.get(lawyer.id) ?? {
          mail: lawyer.mail,
          name: lawyer.name,
          items: [],
        }

        for (const movement of fresh) {
          bucket.items.push({
            caseId: item.id,
            caseTitle: item.title,
            processNumber,
            date: movement.date,
            description: movement.description,
          })
        }

        recipients.set(lawyer.id, bucket)
      }
    } catch (err) {
      failed += 1
      console.error('DataJud sync failed for case', { caseId: item.id, err })
    }

    // Marca mesmo quando falha: o caso que erra volta para o fim da fila em vez
    // de segurar a vaga de todos os outros na próxima rodada.
    await prisma.case.update({
      where: { id: item.id },
      data: { lastMovementSyncAt: new Date() },
    })

    if (delayMs > 0) await sleep(delayMs)
  }

  const notified = recipients.size > 0 ? await notify(recipients) : 0

  return { checked: cases.length, imported, notified, failed }
}
