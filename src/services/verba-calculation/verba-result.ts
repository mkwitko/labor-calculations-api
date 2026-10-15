/**
 * Resultado de uma calculadora de verba isolada. Tem a mesma forma do
 * `PublicResult` da calculadora de rescisão de propósito: a tela pública já sabe
 * consumir `lines`, e uma segunda forma significaria uma segunda tela.
 */
export type VerbaCertainty = 'documental' | 'requer_prova'

export type VerbaLine = {
  name: string
  legalRef?: string
  total: number
  certainty: VerbaCertainty
}

export type VerbaResult = {
  floor: number
  ceiling: number
  lines: VerbaLine[]
  pending: string[]
  /**
   * Pretensão extinta pela prescrição bienal (CF Art. 7º, XXIX). O resultado sai
   * zerado e a tela mostra o aviso no lugar do número — devolver R$ 0,00 sem
   * explicação faria a pessoa achar que a calculadora quebrou.
   */
  prescribed: boolean
}

const round = (v: number) => Math.round(v * 100) / 100

export function buildVerbaResult(
  lines: VerbaLine[],
  prescribed = false,
): VerbaResult {
  const floor = round(
    lines
      .filter((line) => line.certainty === 'documental')
      .reduce((sum, line) => sum + line.total, 0),
  )
  const ceiling = round(lines.reduce((sum, line) => sum + line.total, 0))
  const pending = lines
    .filter((line) => line.certainty === 'requer_prova')
    .map((line) => line.name)

  return { floor, ceiling, lines, pending, prescribed }
}
