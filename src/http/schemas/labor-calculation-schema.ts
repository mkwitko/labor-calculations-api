import { $Enums, Prisma } from '@prisma/client'
import { z } from 'zod'
import { decimalField } from './zod-helpers'

export const fgtsEntrySchema = z.object({
  id: z.string(),
  month: z.date(),
  base: z.number(),
  aliquot: z.number(),
  deposit: z.number(),
  corrected: z.number(),
  correctionAmount: z.number(),
  interest: z.number(),
  total: z.number(),
  createdAt: z.date(),
})

export const laborCalculationDetailSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string(),
  clientDocument: z.string().nullable(),
  observations: z.string().nullable(),
  calculationVersion: z.string(),
  status: z.enum($Enums.CalculationStatus),
  terminationType: z.enum($Enums.TerminationType),
  shareCode: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),

  // Procedência. Nulo em cálculo anterior ao rastreio — a tela precisa dizer
  // "não registrada" em vez de fingir que existe snapshot.
  indexSnapshotId: z.string().nullable(),
  // Só a rota autenticada de detalhe carrega o hash (exige join); portal do
  // cliente e link compartilhado reusam este schema e não o trazem.
  indexSnapshotHash: z.string().nullish(),
  engineVersion: z.string().nullable(),
  indexesUpdatedAt: z.date().nullable(),

  // Memória de cálculo persistida: uma linha por verba, com fundamento legal.
  // Vazia em cálculo anterior ao rastreio — a tela cai na reconstrução antiga.
  verbaLines: z
    .array(
      z.object({
        order: z.number(),
        name: z.string(),
        legalRef: z.string().nullable(),
        bruto: decimalField,
        corrigido: decimalField,
        juros: decimalField,
        total: decimalField,
      }),
    )
    .optional(),

  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  lastSalary: decimalField,
  baseSalary: decimalField,
  unpaid13ths: decimalField,
  vacationCount: decimalField,
  vacationVencidasCount: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number().min(0).default(0),
  ),
  priorNoticeWorked: z.boolean(),
  priorNoticeDate: z.coerce.date().optional(),
  extraHours: decimalField,
  nightHours: decimalField,
  insalubrityLevel: decimalField,
  dangerousWork: z.boolean(),
  lastThreeSalariesAvg: decimalField,

  applyArt477Fine: z.boolean().default(false),

  priorNoticeValue: decimalField,
  thirteenthSalaryValue: decimalField,
  vacationValue: decimalField,
  fgtsValue: decimalField,
  fgtsFineValue: decimalField,
  unemploymentInsuranceValue: decimalField,
  extraHoursValue: decimalField,
  nightAdditionalValue: decimalField,
  insalubrityValue: decimalField,
  dangerousWorkValue: decimalField,
  art477FineValue: decimalField,
  totalValue: decimalField,
  reflexo13thValue: decimalField,
  reflexoVacationValue: decimalField,
  reflexoFGTSValue: decimalField,
  reflexoMultaFGTSValue: decimalField,
  doubleVacationValue: decimalField,

  nightAdditionalPercent: decimalField,
  satRate: decimalField,
  employerInssRate: decimalField,
  honorariosRate: decimalField,
  irpfDependents: decimalField,
  filingDate: z.date().nullable(),
  liquidationDate: z.date().nullable(),
  saldoSalarioValue: decimalField,
  correctionTotal: decimalField,
  interestTotal: decimalField,
  inssEmployeeValue: decimalField,
  inssEmployerValue: decimalField,
  satRatValue: decimalField,
  irpfValue: decimalField,
  custasJudiciaisValue: decimalField,
  honorariosSucumbenciaValue: decimalField,
  honorariosIrpfValue: decimalField,
  honorariosLiquidosValue: decimalField,
  brutoDevidoReclamante: decimalField,
  totalDescontos: decimalField,
  liquidoDevidoReclamante: decimalField,
  totalDevidoReclamado: decimalField,
  percentualRemuneratorio: decimalField,
  fgtsEntries: z.array(fgtsEntrySchema),
  salaryHistory: z.array(
    z.object({
      id: z.string(),
      month: z.date(),
      baseSalary: z.number(),
      lastSalary: z.number(),
      createdAt: z.date(),
    }),
  ),
  unpaidSalaries: z.array(
    z.object({
      id: z.string(),
      month: z.date(),
      daysWorked: z.number(),
      createdAt: z.date(),
    }),
  ),
  applyArt467: z.boolean().default(false),
  applyPrescricaoQuinquenal: z.boolean().default(false),
  prescricaoCutoff: z.date().nullable(),
  salaryDifferenceType: z.enum($Enums.SalaryDifferenceType).nullable(),
  paradigmName: z.string().nullable(),
  salaryDifferenceApplyReflexos: z.boolean().default(true),
  art467Value: decimalField,
  salaryDifferenceValue: decimalField,
  salaryDifferenceReflexosValue: decimalField,
  outrasVerbasValue: decimalField,
  customVerbasReflexosValue: decimalField,
  intervalIntrajornadaHours: decimalField,
  transferAdditionalMonths: decimalField,
  intervalIntrajornadaValue: decimalField,
  transferAdditionalValue: decimalField,
  applyDsrOnExtra: z.boolean().default(false),
  stabilityMonths: decimalField,
  fgtsAlreadyDeposited: decimalField,
  amountsAlreadyPaid: decimalField,
  dsrValue: decimalField,
  stabilityValue: decimalField,
  deductionsValue: decimalField,
  salaryDifferencePeriods: z.array(
    z.object({
      id: z.string(),
      startMonth: z.date(),
      endMonth: z.date(),
      dueSalary: z.number(),
      receivedSalary: z.number().nullable(),
      createdAt: z.date(),
    }),
  ),
  salaryDifferenceEntries: z.array(
    z.object({
      id: z.string(),
      month: z.date(),
      due: z.number(),
      received: z.number(),
      diff: z.number(),
      corrected: z.number(),
      correctionAmount: z.number(),
      interest: z.number(),
      total: z.number(),
      createdAt: z.date(),
    }),
  ),
  customVerbas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      monthlyValue: z.number(),
      startMonth: z.date(),
      endMonth: z.date(),
      nature: z.enum($Enums.CustomVerbaNature),
      brutoValue: z.number(),
      correctedValue: z.number(),
      interestValue: z.number(),
      totalValue: z.number(),
      createdAt: z.date(),
    }),
  ),
  settlements: z.array(
    z.object({
      id: z.string(),
      agreementRate: decimalField,
      feeType: z.string(),
      feeValue: decimalField,
      agreementValue: decimalField,
      feeAmount: decimalField,
      netToClient: decimalField,
      estimatedTime: z.string(),
      status: z.string(),
      settledAt: z.date().nullable(),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  ),
  user: z.object({
    id: z.string(),
    name: z.string(),
    document: z.string(),
    mail: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
})

export const salaryHistoryEntrySchema = z.object({
  month: z.string(),
  baseSalary: z.number(),
  lastSalary: z.number(),
})

export const unpaidSalaryEntrySchema = z.object({
  month: z.string(),
  daysWorked: z.number().int().min(0).max(30),
})

const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM')

export const salaryDifferencePeriodSchema = z
  .object({
    startMonth: monthKey,
    endMonth: monthKey,
    dueSalary: z.number().positive(),
    receivedSalary: z.number().min(0).optional(),
  })
  .refine((p) => p.startMonth <= p.endMonth, {
    message: 'startMonth must be before or equal to endMonth',
    path: ['startMonth'],
  })

export const salaryDifferenceSchema = z.object({
  type: z.enum($Enums.SalaryDifferenceType),
  paradigmName: z.string().max(200).optional(),
  applyReflexos: z.boolean().default(true),
  periods: z.array(salaryDifferencePeriodSchema).min(1).max(24),
})

export const customVerbaSchema = z
  .object({
    name: z.string().min(1).max(120),
    monthlyValue: z.number().positive(),
    startMonth: monthKey,
    endMonth: monthKey,
    nature: z.enum($Enums.CustomVerbaNature).default('indenizatoria'),
  })
  .refine((v) => v.startMonth <= v.endMonth, {
    message: 'startMonth must be before or equal to endMonth',
    path: ['startMonth'],
  })

/**
 * Os `.describe()` daqui são a documentação da API pública: é o que a referência
 * em `/docs/api` mostra a quem integra. Descrição errada é pior que ausente,
 * então cada uma diz o que o **motor** faz com o campo — inclusive quando a
 * resposta é "nada" (`vacationCount` e `unpaid13ths` no V3).
 */
const baseLaborCalculationBody = z.object({
  clientName: z
    .string()
    .describe('Nome do reclamante. Aparece no cálculo e nos documentos.'),
  clientDocument: z
    .string()
    .optional()
    .describe('CPF do reclamante, com ou sem pontuação.'),
  clientId: z
    .string()
    .optional()
    .describe(
      'Id de um cliente já cadastrado, para vincular o cálculo a ele. Omita para um cálculo solto.',
    ),
  observations: z
    .string()
    .optional()
    .describe('Texto livre guardado junto do cálculo.'),
  startDate: z.coerce
    .date()
    .describe('Data de admissão, em ISO 8601 (ex.: 2020-01-10).'),
  endDate: z.coerce
    .date()
    .describe(
      'Data do término do contrato, em ISO 8601. Precisa ser posterior a startDate.',
    ),
  lastSalary: z
    .number()
    .describe(
      'Última remuneração mensal, em reais. Base do aviso prévio, do 13º, das férias e do saldo de salário.',
    ),
  baseSalary: z
    .number()
    .describe(
      'Salário base contratual, sem adicionais. Base do adicional de periculosidade e do de transferência.',
    ),
  unpaid13ths: z
    .number()
    .describe(
      'Quantidade de décimos terceiros em atraso. Guardado no cálculo, mas **sem efeito no resultado da liquidação**: o V3 apura o 13º por avos entre admissão e término.',
    ),
  vacationCount: z
    .number()
    .describe(
      'Períodos de férias, no formato antigo da estimativa. Guardado no cálculo, mas **sem efeito no resultado da liquidação**: use vacationVencidasCount para férias vencidas — as proporcionais saem dos avos.',
    ),
  vacationVencidasCount: z
    .number()
    .min(0)
    .default(0)
    .describe(
      'Períodos aquisitivos completos não gozados. Cada um é pago em dobro na rescisão (CLT art. 137), já com o terço constitucional.',
    ),
  priorNoticeWorked: z
    .boolean()
    .describe(
      'true quando o aviso prévio foi cumprido trabalhando; false quando é indenizado.',
    ),
  priorNoticeDate: z.coerce
    .date()
    .optional()
    .describe('Data da comunicação do aviso prévio, em ISO 8601.'),
  extraHours: z
    .number()
    .describe(
      'Total de horas extras do contrato inteiro — não a média mensal. Pagas com adicional de 50%.',
    ),
  nightHours: z
    .number()
    .describe(
      'Total de horas noturnas do contrato inteiro — não a média mensal. O adicional vem de nightAdditionalPercent.',
    ),
  insalubrityLevel: z
    .union([z.literal(0), z.literal(10), z.literal(20), z.literal(40)])
    .describe(
      'Grau de insalubridade: 0 (nenhum), 10 (mínimo), 20 (médio) ou 40 (máximo). Incide sobre o salário mínimo, por mês trabalhado (CLT art. 192).',
    ),
  dangerousWork: z
    .boolean()
    .describe(
      'Periculosidade: 30% do salário base por mês trabalhado (CLT art. 193 §1º).',
    ),
  lastThreeSalariesAvg: z
    .number()
    .describe(
      'Média das três últimas remunerações. Usada só para estimar o seguro-desemprego, pelas faixas da Lei 7.998/90.',
    ),
  applyArt477Fine: z
    .boolean()
    .default(false)
    .describe(
      'Multa do art. 477 §8º da CLT: uma remuneração, quando o pagamento da rescisão atrasa.',
    ),
  terminationType: z
    .enum($Enums.TerminationType)
    .describe(
      'Modalidade da rescisão. com_justa_causa zera 13º, férias, aviso e multa de 40%.',
    ),
})

export const createLaborCalculationV2Body = baseLaborCalculationBody.extend({
  status: z.enum($Enums.CalculationStatus).optional(),
})

/**
 * `.partial()` do zod marca o campo como opcional mas **mantém** o `.default()`
 * de dentro: um PUT sem `applyArt477Fine` chegava ao serviço como `false`, e o
 * `?? existing.applyArt477Fine` do merge nunca disparava. Efeito: editar o nome
 * do cliente apagava a multa do art. 477 do cálculo salvo. Redeclarar os campos
 * com default como `.optional()` puro é o que faz "ausente" significar
 * "não mexer".
 */
const partialWithoutDefaults = {
  vacationVencidasCount: z.number().min(0).optional(),
  applyArt477Fine: z.boolean().optional(),
}

export const updateLaborCalculationV2Body = baseLaborCalculationBody
  .partial()
  .extend(partialWithoutDefaults)
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export const createLaborCalculationV3Body = baseLaborCalculationBody
  .extend({
    // Redeclarado aqui: o `extend` substitui o campo do base, então a descrição
    // precisa vir junto ou a referência mostra o campo pelado.
    clientId: z
      .string()
      .optional()
      .describe(
        'Id de um cliente já cadastrado, para vincular o cálculo a ele. Omita para um cálculo solto.',
      ),
    salaryHistory: z
      .array(salaryHistoryEntrySchema)
      .optional()
      .describe(
        'Evolução salarial, mês a mês (YYYY-MM). Sem ela, o FGTS do período é apurado pelo salário informado.',
      ),
    unpaidSalaries: z
      .array(unpaidSalaryEntrySchema)
      .optional()
      .describe(
        'Meses com salário em atraso e quantos dias foram trabalhados em cada um. Viram saldo de salário.',
      ),
    filingDate: z.coerce
      .date()
      .optional()
      .describe(
        'Data do ajuizamento, em ISO 8601. É dela que sai o corte da prescrição quinquenal.',
      ),
    liquidationDate: z.coerce
      .date()
      .optional()
      .describe(
        'Data até a qual corrigir e contar juros, em ISO 8601. Ausente significa hoje.',
      ),
    nightAdditionalPercent: z
      .number()
      .min(0)
      .max(100)
      .default(20)
      .describe(
        'Percentual do adicional noturno (CLT art. 73 dá 20%). Percentual, não fração: 20 significa 20%.',
      ),
    satRate: z
      .number()
      .min(0)
      .max(100)
      .default(3)
      .describe(
        'Alíquota do RAT/SAT usada nos encargos do empregador. Percentual: 3 significa 3%.',
      ),
    employerInssRate: z
      .number()
      .min(0)
      .max(100)
      .default(20)
      .describe(
        'Alíquota patronal de INSS sobre as verbas salariais. Percentual: 20 significa 20%.',
      ),
    honorariosRate: z
      .number()
      .min(0)
      .max(100)
      .default(15)
      .describe(
        'Percentual de honorários calculado sobre o valor da condenação. Percentual: 15 significa 15%.',
      ),
    irpfDependents: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Número de dependentes, para a dedução do IRPF.'),
    applyArt467: z
      .boolean()
      .default(false)
      .describe(
        'Art. 467 da CLT: acréscimo de 50% sobre as verbas rescisórias incontroversas não pagas na primeira audiência.',
      ),
    applyPrescricaoQuinquenal: z
      .boolean()
      .default(false)
      .describe(
        'Corta as parcelas anteriores a cinco anos da data de ajuizamento (CF art. 7º, XXIX).',
      ),
    salaryDifference: salaryDifferenceSchema
      .optional()
      .describe(
        'Diferença salarial (equiparação, desvio de função, acúmulo), por períodos, com ou sem reflexos nas demais verbas.',
      ),
    customVerbas: z
      .array(customVerbaSchema)
      .max(20)
      .optional()
      .describe(
        'Verbas fora da tabela padrão, cada uma com valor mensal, intervalo de meses e natureza (salarial ou indenizatória).',
      ),
    intervalIntrajornadaHours: z
      .number()
      .min(0)
      .max(300)
      .optional()
      .describe(
        'Horas de intervalo suprimidas **por mês** (CLT art. 71 §4º), pagas com adicional de 50%. Diferente de extraHours, que é total do contrato.',
      ),
    transferAdditionalMonths: z
      .number()
      .int()
      .min(0)
      .max(600)
      .optional()
      .describe(
        'Meses em que houve transferência provisória: 25% do salário base em cada (CLT art. 469 §3º).',
      ),
    applyDsrOnExtra: z
      .boolean()
      .optional()
      .describe(
        'Reflexo em DSR sobre horas extras e adicional noturno (Lei 605/49).',
      ),
    stabilityMonths: z
      .number()
      .int()
      .min(0)
      .max(600)
      .optional()
      .describe(
        'Meses de estabilidade a indenizar: salários do período mais os reflexos de 13º e férias.',
      ),
    fgtsAlreadyDeposited: z
      .number()
      .min(0)
      .optional()
      .describe('FGTS já depositado, em reais. Abatido do total devido.'),
    amountsAlreadyPaid: z
      .number()
      .min(0)
      .optional()
      .describe('Valores já pagos ao reclamante, em reais. Abatidos do total.'),
  })
  .refine((b) => b.startDate < b.endDate, {
    message: 'startDate must be before endDate',
    path: ['startDate'],
  })

export const updateLaborCalculationV3Body = baseLaborCalculationBody
  .partial()
  .extend({
    ...partialWithoutDefaults,
    salaryHistory: z.array(salaryHistoryEntrySchema).optional(),
    unpaidSalaries: z.array(unpaidSalaryEntrySchema).optional(),
    filingDate: z.coerce.date().optional(),
    liquidationDate: z.coerce.date().optional(),
    nightAdditionalPercent: z.number().min(0).max(100).optional(),
    satRate: z.number().min(0).max(100).optional(),
    employerInssRate: z.number().min(0).max(100).optional(),
    honorariosRate: z.number().min(0).max(100).optional(),
    irpfDependents: z.number().int().min(0).optional(),
    applyArt467: z.boolean().optional(),
    applyPrescricaoQuinquenal: z.boolean().optional(),
    // null clears the stored salary difference; undefined keeps it
    salaryDifference: salaryDifferenceSchema.nullish(),
    customVerbas: z.array(customVerbaSchema).max(20).optional(),
    intervalIntrajornadaHours: z.number().min(0).max(300).optional(),
    transferAdditionalMonths: z.number().int().min(0).max(600).optional(),
    applyDsrOnExtra: z.boolean().optional(),
    stabilityMonths: z.number().int().min(0).max(600).optional(),
    fgtsAlreadyDeposited: z.number().min(0).optional(),
    amountsAlreadyPaid: z.number().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine((b) => !b.startDate || !b.endDate || b.startDate < b.endDate, {
    message: 'startDate must be before endDate',
    path: ['startDate'],
  })
