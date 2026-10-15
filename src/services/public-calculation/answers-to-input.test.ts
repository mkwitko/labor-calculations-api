import { describe, expect, it } from 'vitest'
import { answersToInput, type PublicAnswers } from './answers-to-input'

const base: PublicAnswers = {
  terminationType: 'sem_justa_causa',
  startDate: '2020-01-10',
  endDate: '2024-06-20',
  lastSalary: 3000,
  registeredContract: true,
  priorNoticeWorked: false,
  unpaid13ths: 1,
  vacationVencidasCount: 1,
  extraHours: 'nao',
  nightWork: 'nao',
  insalubrity: 'nao',
  dangerousWork: 'nao',
}

describe('answersToInput', () => {
  it('deriva os campos que o leigo não responde', () => {
    const input = answersToInput(base)

    expect(input.clientName).toBe('Consulta pública')
    expect(input.baseSalary).toBe(3000)
    expect(input.lastThreeSalariesAvg).toBe(3000)
    expect(input.startDate).toEqual(new Date('2020-01-10T00:00:00.000Z'))
    expect(input.endDate).toEqual(new Date('2024-06-20T00:00:00.000Z'))
    expect(input.vacationCount).toBe(0)
  })

  it('só pede a multa do art. 477 quando ela cabe', () => {
    expect(answersToInput(base).applyArt477Fine).toBe(true)
    expect(
      answersToInput({ ...base, terminationType: 'com_justa_causa' })
        .applyArt477Fine,
    ).toBe(false)
  })

  it('"não sei" vira a estimativa cheia da verba', () => {
    const input = answersToInput({
      ...base,
      extraHours: 'nao_sei',
      nightWork: 'nao_sei',
      insalubrity: 'nao_sei',
      dangerousWork: 'nao_sei',
    })

    expect(input.extraHours).toBeGreaterThan(1000)
    expect(input.nightHours).toBeGreaterThan(1000)
    expect(input.insalubrityLevel).toBe(20)
    expect(input.dangerousWork).toBe(true)
  })

  it('"sim" e "não" respondem por si', () => {
    const sim = answersToInput({ ...base, extraHours: 'sim' })
    expect(sim.extraHours).toBeGreaterThan(1000)

    const nao = answersToInput(base)
    expect(nao.extraHours).toBe(0)
    expect(nao.nightHours).toBe(0)
    expect(nao.insalubrityLevel).toBe(0)
    expect(nao.dangerousWork).toBe(false)
  })

  it('a suposição mensal vira total do período', () => {
    const curto = answersToInput({
      ...base,
      startDate: '2024-01-10',
      endDate: '2024-07-10',
      extraHours: 'sim',
    })
    const longo = answersToInput({
      ...base,
      startDate: '2019-01-10',
      endDate: '2024-01-10',
      extraHours: 'sim',
    })

    // 6 meses × 20h e 60 meses × 20h. A contagem de meses do motor é aproximada
    // (365,25/30), então a faixa é larga de propósito: o que importa é que o
    // contrato longo não receba o mesmo total do curto, que era o defeito.
    expect(curto.extraHours).toBeGreaterThan(115)
    expect(curto.extraHours).toBeLessThan(130)
    expect(longo.extraHours).toBeGreaterThan(1180)
    expect(longo.extraHours).toBeLessThan(1240)
    expect(longo.extraHours).toBeGreaterThan(curto.extraHours * 9)
  })

  it('"não sei" e "sim" valem o mesmo total; "não" zera', () => {
    const naoSei = answersToInput({ ...base, extraHours: 'nao_sei' })
    const sim = answersToInput({ ...base, extraHours: 'sim' })
    const nao = answersToInput(base)

    expect(naoSei.extraHours).toBe(sim.extraHours)
    expect(sim.extraHours).toBeGreaterThan(1000)
    expect(nao.extraHours).toBe(0)
  })

  it('liga o DSR quando há hora extra ou noturno, e só nesse caso', () => {
    expect(answersToInput({ ...base, extraHours: 'sim' }).applyDsrOnExtra).toBe(
      true,
    )
    expect(answersToInput({ ...base, nightWork: 'sim' }).applyDsrOnExtra).toBe(
      true,
    )
    expect(answersToInput(base).applyDsrOnExtra).toBe(false)
  })

  it('sem carteira assinada, o vínculo pedido é o cheio', () => {
    const input = answersToInput({ ...base, registeredContract: false })
    expect(input.applyArt467).toBe(true)
  })
})
