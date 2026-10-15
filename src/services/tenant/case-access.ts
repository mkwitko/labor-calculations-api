import type { Prisma } from '@prisma/client'
import { prisma } from 'prisma/prisma'
import { ForbiddenException } from '@/http/exceptions/forbidden-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import type { TenantActor } from './actor'
import { canAccessFinance, canWriteCases, caseVisibility } from './visibility'

/**
 * Substitui os quatro `assertCaseOwned` que estavam duplicados nos
 * controllers (`case-parties`, `case-tasks`, `case-movements`,
 * `case-finance`). Um lugar só para a regra: quatro cópias divergem na
 * primeira exceção que alguém precisar abrir.
 */

/**
 * Lê o caso pela lente do papel. Devolve `null` em vez de lançar, para o
 * controller que precisa de campos do caso além do `id`.
 */
export async function findVisibleCase<S extends Prisma.CaseSelect>(
  actor: TenantActor,
  caseId: string,
  select: S,
): Promise<Prisma.CaseGetPayload<{ select: S }> | null> {
  return prisma.case.findFirst({
    where: { id: caseId, ...caseVisibility(actor), deletedAt: null },
    select,
  }) as Promise<Prisma.CaseGetPayload<{ select: S }> | null>
}

/**
 * 404, não 403: para um associado, caso de colega não existe. Confirmar a
 * existência já entregaria que o escritório tem aquele processo.
 */
export async function assertCaseVisible(
  actor: TenantActor,
  caseId: string,
): Promise<void> {
  const found = await findVisibleCase(actor, caseId, { id: true })

  if (!found) throw new ResourceNotFoundException('Caso não encontrado')
}

/**
 * Visibilidade primeiro, verbo depois — e a ordem importa. Se o papel não
 * enxerga o caso, a resposta é 404 e para aí; um 403 nessa situação
 * confirmaria a existência do caso do colega.
 */
export async function assertCaseWritable(
  actor: TenantActor,
  caseId: string,
): Promise<void> {
  await assertCaseVisible(actor, caseId)

  if (!canWriteCases(actor.role)) {
    throw new ForbiddenException(
      'Seu papel na organização não permite alterar casos',
    )
  }
}

/** Honorário, parcelas de acordo e dashboard de caixa. */
export function assertFinanceAccess(actor: TenantActor): void {
  if (!canAccessFinance(actor.role)) {
    throw new ForbiddenException(
      'Seu papel na organização não dá acesso ao financeiro',
    )
  }
}
