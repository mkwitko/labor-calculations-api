import type { LaborCalculationResultV3 } from '@/@types/labor-calculation-v3'

/**
 * `documental` = a verba se prova com contracheque, CTPS, extrato do FGTS e
 * TRCT. `requer_prova` = depende de testemunha, perícia ou instrução — pode cair
 * inteira. A faixa mostrada ao leigo é [soma das documentais, total].
 */
export type Certainty = 'documental' | 'requer_prova'

export type PublicVerbaLine = {
  name: string
  legalRef?: string
  total: number
  certainty: Certainty
}

export type PublicResult = {
  floor: number
  ceiling: number
  lines: PublicVerbaLine[]
  pending: string[]
}

/**
 * Nomes exatos emitidos por `calculateLaborV3` para as verbas que se provam com
 * documento. Comparação por prefixo porque alguns carregam o percentual no
 * nome. Tudo que não casar é tratado como `requer_prova` — verba nova no motor
 * não entra calada no piso.
 */
const DOCUMENTAL_PREFIXES = [
  'Saldo de Salário',
  '13º Salário',
  'Férias + 1/3',
  'Aviso Prévio',
  'FGTS 8%',
  'Multa FGTS 40%',
  'Multa Art. 477 CLT',
  'Multa Art. 467 CLT',
  'Abatimentos',
]

export function classifyVerba(name: string): Certainty {
  return DOCUMENTAL_PREFIXES.some((prefix) => name.startsWith(prefix))
    ? 'documental'
    : 'requer_prova'
}

export function buildPublicResult(
  result: LaborCalculationResultV3,
): PublicResult {
  const lines: PublicVerbaLine[] = result.verbasDetalhadas.map((verba) => ({
    name: verba.name,
    legalRef: verba.legalRef,
    total: verba.total,
    certainty: classifyVerba(verba.name),
  }))

  const floor = lines
    .filter((line) => line.certainty === 'documental')
    .reduce((sum, line) => sum + line.total, 0)

  const ceiling = lines.reduce((sum, line) => sum + line.total, 0)

  const pending = lines
    .filter((line) => line.certainty === 'requer_prova')
    .map((line) => line.name)

  return { floor, ceiling, lines, pending }
}
