import type { OrgRole, Prisma } from '@prisma/client'
import type { TenantActor } from './actor'

/**
 * Isolamento de organização é implícito e invariante — a extension de tenant
 * cuida dele em toda operação raiz. Visibilidade por papel é o oposto:
 * explícita, e diferente por endpoint. O financeiro **vê** o caso para lançar
 * honorário mas não o edita; o associado edita o caso dele e não vê o do
 * colega. Por isso estas funções devolvem fragmento de `where` em vez de
 * entrarem na extension.
 */

/** Papéis que enxergam todo caso da organização. */
const READ_ALL_CASES: ReadonlySet<OrgRole> = new Set([
  'owner',
  'admin',
  'staff',
])

/** Papéis que escrevem caso (criar, editar, apagar, e os filhos do caso). */
const WRITE_CASES: ReadonlySet<OrgRole> = new Set(['owner', 'admin', 'lawyer'])

/** Papéis com acesso ao financeiro: honorário, parcelas, dashboard de caixa. */
const FINANCE: ReadonlySet<OrgRole> = new Set(['owner', 'admin', 'staff'])

/** Papéis que administram membros e convites (consumido pelo Plano 2B). */
const MANAGE_MEMBERS: ReadonlySet<OrgRole> = new Set(['owner', 'admin'])

export function seesAllCases(role: OrgRole): boolean {
  return READ_ALL_CASES.has(role)
}

export function canWriteCases(role: OrgRole): boolean {
  return WRITE_CASES.has(role)
}

export function canAccessFinance(role: OrgRole): boolean {
  return FINANCE.has(role)
}

export function canManageMembers(role: OrgRole): boolean {
  return MANAGE_MEMBERS.has(role)
}

/**
 * Fragmento de `where` para consulta raiz de `Case`. Objeto vazio é a resposta
 * certa para quem enxerga tudo: o filtro de organização já foi injetado.
 */
export function caseVisibility(actor: TenantActor): Prisma.CaseWhereInput {
  return seesAllCases(actor.role) ? {} : { assignedToId: actor.userId }
}

/**
 * O mesmo fragmento, para uso aninhado — `where: { case: ... }` nos filhos do
 * caso (audiência, prazo, nota, documento, parcela). Traz `deletedAt: null`
 * porque nenhum desses endpoints deve alcançar caso na lixeira.
 */
export function caseRelationVisibility(
  actor: TenantActor,
): Prisma.CaseWhereInput {
  return { ...caseVisibility(actor), deletedAt: null }
}

/**
 * `LaborCalculation` tem duas naturezas: preso a um caso (herda a
 * visibilidade dele) ou solto — a estimativa rápida que ainda não virou caso.
 * O cálculo solto fica com quem o criou, mais os papéis que enxergam tudo;
 * sem essa segunda perna, uma estimativa nunca vinculada ficaria invisível
 * para o próprio autor associado.
 */
export function calculationVisibility(
  actor: TenantActor,
): Prisma.LaborCalculationWhereInput {
  if (seesAllCases(actor.role)) return {}

  return {
    OR: [
      { case: { assignedToId: actor.userId } },
      { caseId: null, userId: actor.userId },
    ],
  }
}
