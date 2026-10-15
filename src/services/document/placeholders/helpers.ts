import type { ResolutionContext } from './types'

// ─── Formatters ────────────────────────────────────────────────────────────
export function fmt(value: number | string | null | undefined): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return String(value)
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function dec(
  row: Record<string, unknown> | null | undefined,
  field: string,
): number {
  const v = row?.[field]
  if (v == null) return 0
  return typeof v === 'object' &&
    typeof (v as { toNumber?: () => number }).toNumber === 'function'
    ? (v as { toNumber: () => number }).toNumber()
    : Number(v)
}

export const TERMINATION_LABELS: Record<string, string> = {
  sem_justa_causa: 'Rescisão sem justa causa',
  com_justa_causa: 'Rescisão com justa causa',
  pedido_demissao: 'Pedido de demissão',
  rescisao_indireta: 'Rescisão indireta',
}

export const CASE_PHASE_LABELS: Record<string, string> = {
  pre_judicial: 'Pré-judicial',
  distribuido: 'Distribuído',
  conhecimento: 'Fase de conhecimento',
  recurso: 'Fase recursal',
  execucao: 'Execução',
  encerrado: 'Encerrado',
}

// The calculation row denormalizes clientName/clientDocument. When a client
// entity is resolved, prefer it; else fall back to the calc's stored strings.
export function clientName(ctx: ResolutionContext): string {
  return String(ctx.client?.name ?? ctx.calculation?.clientName ?? '')
}
export function clientDocument(ctx: ResolutionContext): string {
  return String(ctx.client?.document ?? ctx.calculation?.clientDocument ?? '')
}

// Convenience for money-valued calculation fields
export const calcMoney =
  (field: string) =>
  (ctx: ResolutionContext): string =>
    fmt(dec(ctx.calculation, field))
