const round = (v: number) => Math.round(v * 100) / 100

export type CustasResult = {
  base: number
  rate: number
  piso: number
  teto: number
  total: number
}

export function calculateCustasJudiciais(
  totalDevidoReclamado: number,
  rate: number = 0.02,
  piso: number = 10.64,
  teto: number = 33902.2,
): CustasResult {
  const calculated = round(totalDevidoReclamado * rate)
  const total = Math.max(piso, Math.min(calculated, teto * rate))
  return {
    base: totalDevidoReclamado,
    rate,
    piso,
    teto,
    total: round(total),
  }
}

export type HonorariosResult = {
  base: number
  rate: number
  honorarios: number
  irpf: number
  liquido: number
}

export function calculateHonorariosSucumbencia(
  brutoDevidoReclamante: number,
  rate: number = 0.15,
): HonorariosResult {
  const honorarios = round(brutoDevidoReclamante * rate)
  let irpf = 0
  if (honorarios > 684.72) {
    let applicableRate = 0
    let deduction = 0
    if (honorarios <= 924.6) {
      applicableRate = 0.075
      deduction = 51.35
    } else if (honorarios <= 1248.3) {
      applicableRate = 0.15
      deduction = 120.69
    } else if (honorarios <= 2213.4) {
      applicableRate = 0.225
      deduction = 214.27
    } else {
      applicableRate = 0.275
      deduction = 324.89
    }
    irpf = round(Math.max(0, honorarios * applicableRate - deduction))
  }
  const liquido = round(honorarios - irpf)
  return { base: brutoDevidoReclamante, rate, honorarios, irpf, liquido }
}
