type CalculateSettlementInput = {
  totalValue: number
  terminationType: string
  agreementRate: number
  feeType: 'percentage' | 'fixed'
  feeValue: number
}

type CalculateSettlementResult = {
  agreementValue: number
  feeAmount: number
  netToClient: number
  estimatedTime: string
}

export function calculateSettlement({
  totalValue,
  terminationType,
  agreementRate,
  feeType,
  feeValue,
}: CalculateSettlementInput): CalculateSettlementResult {
  const agreementValue = totalValue * agreementRate

  let feeAmount: number
  if (feeType === 'percentage') {
    feeAmount = agreementValue * (feeValue / 100)
  } else {
    feeAmount = feeValue
  }

  const netToClient = agreementValue - feeAmount

  let estimatedTime: string
  switch (terminationType) {
    case 'pedido_demissao':
      estimatedTime = 'Rápido'
      break
    case 'sem_justa_causa':
      estimatedTime = 'Médio'
      break
    case 'com_justa_causa':
      estimatedTime = 'Longo'
      break
    default:
      estimatedTime = 'Médio'
  }

  return { agreementValue, feeAmount, netToClient, estimatedTime }
}
