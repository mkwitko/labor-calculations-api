const modelTranslations: Record<string, string> = {
  User: 'Usuário',
  LaborCalculation: 'Cálculo Trabalhista',
  Settlement: 'Acordo',
  BaseValues: 'Valores Base',
  RefreshToken: 'Token de Atualização',
}

const fieldTranslations: Record<string, string> = {
  id: 'identificador',
  name: 'nome',
  mail: 'e-mail',
  document: 'documento',
  password: 'senha',
  createdAt: 'data de criação',
  updatedAt: 'data de atualização',
  deletedAt: 'data de exclusão',
  trialEndsAt: 'fim do período de teste',
  isAdmin: 'administrador',
  officeName: 'nome do escritório',
  oabNumber: 'número OAB',
  phone: 'telefone',
  logoUrl: 'URL do logotipo',
  address: 'endereço',
  website: 'site',
  bio: 'biografia',
  userId: 'usuário',
  clientName: 'nome do cliente',
  clientDocument: 'documento do cliente',
  observations: 'observações',
  startDate: 'data de início',
  endDate: 'data de término',
  lastSalary: 'último salário',
  baseSalary: 'salário base',
  unpaid13ths: '13º salários devidos',
  vacationCount: 'quantidade de férias',
  vacationVencidasCount: 'férias vencidas',
  priorNoticeWorked: 'aviso prévio trabalhado',
  priorNoticeDate: 'data do aviso prévio',
  extraHours: 'horas extras',
  nightHours: 'horas noturnas',
  insalubrityLevel: 'nível de insalubridade',
  dangerousWork: 'trabalho perigoso',
  lastThreeSalariesAvg: 'média dos últimos três salários',
  applyArt477Fine: 'aplicar multa art. 477',
  calculationVersion: 'versão do cálculo',
  terminationType: 'tipo de rescisão',
  status: 'status',
  shareCode: 'código de compartilhamento',
  laborCalculationId: 'cálculo trabalhista',
  agreementRate: 'taxa de acordo',
  feeType: 'tipo de honorário',
  feeValue: 'valor do honorário',
  agreementValue: 'valor do acordo',
  feeAmount: 'valor dos honorários',
  netToClient: 'líquido para o cliente',
  estimatedTime: 'tempo estimado',
  settledAt: 'data do acordo',
  fgtsRate: 'taxa FGTS',
  minimumWage: 'salário mínimo',
  stripeCustomerId: 'ID do cliente Stripe',
  tokenHash: 'hash do token',
  family: 'família do token',
  isRevoked: 'revogado',
  expiresAt: 'data de expiração',
}

export function translateName(name: string, isModel = false): string {
  const translations = isModel ? modelTranslations : fieldTranslations
  return translations[name] || name
}

export function formatFieldName(fieldName: string | undefined): string {
  if (!fieldName) {
    return ''
  }
  return translateName(fieldName).toLowerCase().replaceAll('_', ' ')
}
