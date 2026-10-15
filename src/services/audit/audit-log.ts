import type { Prisma } from '@prisma/client'
import { prisma } from 'prisma/prisma'
import { captureException } from '@/lib/sentry'
import { requireOrganizationId } from '@/lib/tenant-context'

/**
 * Trilha de auditoria do cálculo.
 *
 * Existe para responder "por que esse número" numa impugnação ou numa auditoria
 * de cliente corporativo: quem mexeu, quando, o que mudou, com qual versão do
 * motor. Complementa o snapshot de índices — um diz qual tabela foi usada, o
 * outro diz quem mandou usá-la.
 *
 * `organizationId` é injetado pela extension de tenant (AuditLog está em
 * TENANT_MODELS), então não vai no `data`.
 *
 * **Nunca lança.** Auditoria que derruba a operação auditada troca um problema
 * de rastreabilidade por um de disponibilidade. Mesmo desenho de `syncSeats`.
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'reindex'
  | 'delete'
  | 'status_change'

export type FieldChange = { from: unknown; to: unknown }
export type Changes = Record<string, FieldChange>

type RecordAuditInput = {
  entityType: 'LaborCalculation'
  entityId: string
  action: AuditAction
  userId?: string | null
  changes?: Changes | null
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: requireOrganizationId(),
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        userId: input.userId ?? null,
        changes: (input.changes ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    })
  } catch (error) {
    captureException(error as Error, {
      scope: 'audit-log',
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
    })
  }
}

// Campos que mudam em toda escrita e não dizem nada a quem audita.
const IGNORED_FIELDS = new Set(['updatedAt', 'createdAt', 'id'])

/** Decimal do Prisma: objeto, mas escalar para efeito de auditoria. */
function isDecimal(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toFixed?: unknown }).toFixed === 'function'
  )
}

function isScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (value instanceof Date || isDecimal(value)) return true
  return typeof value !== 'object'
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  // Comparar Decimal por representação evita falso positivo entre 3500 e
  // Decimal("3500.00").
  if (isDecimal(value)) return String(value)
  return value
}

/**
 * Diff de campos escalares entre o antes e o depois de uma escrita. Relações
 * (arrays, objetos aninhados) ficam de fora: quem audita quer saber que o
 * salário mudou de 3500 para 7000, não que a lista de meses de FGTS foi
 * reescrita inteira.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Changes {
  const changes: Changes = {}

  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key)) continue

    const a = after[key]
    if (!isScalar(a)) continue

    const from = normalize(before[key])
    const to = normalize(a)
    if (from !== to) changes[key] = { from, to }
  }

  return changes
}
