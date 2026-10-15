import type { LaborCalculationInputV3 } from '@/@types/labor-calculation-v3'
import { countWorkedMonths } from '@/services/labor-calculation/date-utils'

/**
 * Resposta de quem não conhece a nomenclatura: além de sim e não, "não sei" é
 * uma resposta legítima — e a mais comum. Ela liga a verba com uma estimativa
 * conservadora, que a classificação de certeza empurra para o teto da faixa.
 */
export type LayAnswer = 'sim' | 'nao' | 'nao_sei'

export type PublicAnswers = {
  terminationType:
    | 'sem_justa_causa'
    | 'com_justa_causa'
    | 'pedido_demissao'
    | 'rescisao_indireta'
  /** 'YYYY-MM-DD' */
  startDate: string
  endDate: string
  lastSalary: number
  registeredContract: boolean
  priorNoticeWorked: boolean
  unpaid13ths: number
  vacationVencidasCount: number
  extraHours: LayAnswer
  nightWork: LayAnswer
  insalubrity: LayAnswer
  dangerousWork: LayAnswer
}

/**
 * Horas extras por mês assumidas quando a pessoa diz que fazia hora extra (ou
 * que não sabe): 1h por dia útil. É o cenário mais comum na Justiça do Trabalho
 * e o que a jornada de 44h semanais comporta sem alegar sobrejornada
 * extraordinária.
 *
 * O motor espera o TOTAL do período, não a média mensal, então este número é
 * multiplicado pelos meses trabalhados antes de entrar no input. Passá-lo direto
 * fazia um contrato de dez anos receber as mesmas 20 horas de um de seis meses.
 */
const ASSUMED_MONTHLY_EXTRA_HOURS = 20

/** Grau médio (20%) — o do meio dos três graus da NR-15. */
const ASSUMED_INSALUBRITY_LEVEL = 20

function assumed(answer: LayAnswer, value: number): number {
  return answer === 'nao' ? 0 : value
}

export function answersToInput(
  answers: PublicAnswers,
): LaborCalculationInputV3 {
  const salary = answers.lastSalary

  const startDate = new Date(`${answers.startDate}T00:00:00.000Z`)
  const endDate = new Date(`${answers.endDate}T00:00:00.000Z`)
  const { totalMonths } = countWorkedMonths(startDate, endDate)

  const extraHours =
    assumed(answers.extraHours, ASSUMED_MONTHLY_EXTRA_HOURS) * totalMonths
  const nightHours =
    assumed(answers.nightWork, ASSUMED_MONTHLY_EXTRA_HOURS) * totalMonths

  return {
    clientName: 'Consulta pública',
    startDate,
    endDate,

    lastSalary: salary,
    // O leigo informa um salário só. Base de cálculo e média dos três últimos
    // meses saem dele: pedir três valores derruba a conclusão do wizard e muda
    // pouco o resultado de quem não tinha remuneração variável.
    baseSalary: salary,
    lastThreeSalariesAvg: salary,

    unpaid13ths: answers.unpaid13ths,
    // Férias proporcionais o motor calcula pelo período trabalhado; aqui só
    // entram as vencidas, que são as que a pessoa sabe responder.
    vacationCount: 0,
    vacationVencidasCount: answers.vacationVencidasCount,

    priorNoticeWorked: answers.priorNoticeWorked,

    extraHours,
    nightHours,
    // Súmula 172 do TST: hora extra e adicional noturno habituais repercutem no
    // repouso semanal remunerado. O cálculo público nunca ligava este sinal, e o
    // DSR saía zerado em toda consulta.
    applyDsrOnExtra: extraHours > 0 || nightHours > 0,
    insalubrityLevel:
      answers.insalubrity === 'nao' ? 0 : ASSUMED_INSALUBRITY_LEVEL,
    dangerousWork: answers.dangerousWork !== 'nao',

    terminationType: answers.terminationType,
    // Art. 477, §8: multa por atraso no pagamento das verbas rescisórias. Não há
    // verba rescisória a pagar na justa causa.
    applyArt477Fine: answers.terminationType !== 'com_justa_causa',
    // Sem registro, as verbas são incontroversas desde o reconhecimento do
    // vínculo — é o caso típico do art. 467.
    applyArt467: !answers.registeredContract,
  }
}
