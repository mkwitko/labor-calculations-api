/**
 * Formatação em português para texto que o cliente lê (notificação, e-mail).
 * Fuso fixo em São Paulo: o servidor roda em UTC e uma audiência às 14h não
 * pode aparecer como 17h para quem recebe o aviso.
 */
const TIME_ZONE = 'America/Sao_Paulo'

export function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIME_ZONE,
  })
}

export function formatDateTimePtBr(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  })
}

/** Reais, a partir de um valor em reais (não em centavos). */
export function formatBrl(value: number | string): string {
  const num = typeof value === 'string' ? Number(value) : value

  return (Number.isNaN(num) ? 0 : num).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
