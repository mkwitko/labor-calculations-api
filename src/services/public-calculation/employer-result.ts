import type { LaborCalculationResultV3 } from '@/@types/labor-calculation-v3'
import { classifyVerba } from './public-result'

/**
 * A leitura do mesmo cálculo pelo lado de quem paga.
 *
 * O motor já produz tudo isto e a calculadora do trabalhador descarta: encargo
 * patronal, custas e honorários de sucumbência. Não há conta nova aqui — há
 * recomposição.
 */
export type EmployerResult = {
  /** O cheque de hoje: verbas documentais mais encargos patronais. */
  severanceCost: number
  /** INSS empresa e SAT/RAT sobre as bases do período. */
  employerCharges: number
  /** Custas judiciais mais honorários de sucumbência. */
  litigationExtras: number
  /** O cenário ruim: desligamento mais o que depende de prova e o processo. */
  exposure: number
  /** Exposição menos custo. É o valor de arrumar a documentação antes. */
  gap: number
}

export type EmployerBreakdownVerba = {
  name: string
  legalRef?: string
  total: number
  certainty: 'documental' | 'requer_prova'
}

/**
 * O mesmo recorte de `buildEmployerResult`, mas devolvendo também as listas —
 * é o que alimenta o demonstrativo por funcionário do /passivo. As somas dos
 * grupos fecham com os agregados por construção (mesma classificação).
 */
export function buildEmployerBreakdown(
  result: LaborCalculationResultV3,
): EmployerResult & { verbas: EmployerBreakdownVerba[] } {
  const verbas: EmployerBreakdownVerba[] = result.verbasDetalhadas
    .filter((verba) => verba.total !== 0)
    .map((verba) => ({
      name: verba.name,
      legalRef: verba.legalRef,
      total: verba.total,
      certainty: classifyVerba(verba.name),
    }))

  return { ...buildEmployerResult(result), verbas }
}

export function buildEmployerResult(
  result: LaborCalculationResultV3,
): EmployerResult {
  const documental = result.verbasDetalhadas
    .filter((verba) => classifyVerba(verba.name) === 'documental')
    .reduce((total, verba) => total + verba.total, 0)

  const requerProva = result.verbasDetalhadas
    .filter((verba) => classifyVerba(verba.name) === 'requer_prova')
    .reduce((total, verba) => total + verba.total, 0)

  // Encargo patronal não é verba do trabalhador: não aparece na memória de
  // cálculo dele, mas sai do caixa da empresa do mesmo jeito.
  const employerCharges = result.inssEmployer + result.satRat

  const litigationExtras = result.custasJudiciais + result.honorariosSucumbencia

  const severanceCost = documental + employerCharges
  const exposure = severanceCost + requerProva + litigationExtras

  return {
    severanceCost,
    employerCharges,
    litigationExtras,
    exposure,
    gap: exposure - severanceCost,
  }
}
