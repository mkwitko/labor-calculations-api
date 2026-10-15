import { $Enums, Prisma } from '@prisma/client'
import { z } from 'zod'

export const settlementSchema = z.object({
  id: z.string(),
  laborCalculationId: z.string(),
  agreementRate: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number(),
  ),
  feeType: z.string(),
  feeValue: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number(),
  ),
  agreementValue: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number(),
  ),
  feeAmount: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number(),
  ),
  netToClient: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number(),
  ),
  estimatedTime: z.string(),
  status: z.string(),
  settledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const settlementBodySchema = z.object({
  agreementRate: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number().min(0.6).max(1),
  ),
  feeType: z.enum($Enums.SettlementFeeType),
  feeValue: z.preprocess(
    (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
    z.number().positive(),
  ),
})
