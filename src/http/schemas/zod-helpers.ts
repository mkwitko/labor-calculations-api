import { Prisma } from '@prisma/client'
import { z } from 'zod'

export const decimalField = z.preprocess(
  (val) => (val instanceof Prisma.Decimal ? val.toNumber() : val),
  z.number(),
)
