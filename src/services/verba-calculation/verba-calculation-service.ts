import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { resolveIndexTable } from '@/services/labor-calculation/index-snapshot'
import { hashInviteToken } from '@/services/tenant/invite-token'
import { MS_PER_DAY } from '@/utils/constants'
import {
  calculateOvertime,
  OVERTIME_ENGINE_VERSION,
  type OvertimeInput,
} from './overtime-calculation'
import {
  calculateVacationAnd13th,
  VACATION_13TH_ENGINE_VERSION,
  type VacationAnd13thInput,
} from './vacation-13th-calculation'
import type { VerbaResult } from './verba-result'

/** Mesmo prazo da calculadora de rescisão: ver `public-calculation-service`. */
const TTL_MS = 90 * MS_PER_DAY

export type VerbaKind = 'horas_extras' | 'ferias_13'

type CommonParams = {
  source: string
  referrerHost?: string
  /**
   * Organização dona do widget que hospedou o formulário, já validada pela
   * chave. Ausente no cálculo feito no nosso próprio site.
   */
  widgetOrganizationId?: string
}

async function persist(params: {
  kind: VerbaKind
  engineVersion: string
  input: object
  result: VerbaResult
  snapshotId: string
  common: CommonParams
}): Promise<string> {
  const token = randomBytes(32).toString('base64url')

  await systemPrisma.publicCalculation.create({
    data: {
      tokenHash: hashInviteToken(token),
      kind: params.kind,
      input: params.input as unknown as Prisma.InputJsonValue,
      result: params.result as unknown as Prisma.InputJsonValue,
      engineVersion: params.engineVersion,
      indexSnapshotId: params.snapshotId,
      source: params.common.source,
      referrerHost: params.common.referrerHost ?? null,
      widgetOrganizationId: params.common.widgetOrganizationId ?? null,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  })

  return token
}

export async function createOvertimeCalculation(
  params: CommonParams & { input: OvertimeInput },
): Promise<{ token: string; result: VerbaResult }> {
  const { table, snapshotId } = await resolveIndexTable()
  const result = calculateOvertime(params.input, table)

  const token = await persist({
    kind: 'horas_extras',
    engineVersion: OVERTIME_ENGINE_VERSION,
    input: params.input,
    result,
    snapshotId,
    common: params,
  })

  return { token, result }
}

export async function createVacationAnd13thCalculation(
  params: CommonParams & { input: VacationAnd13thInput },
): Promise<{ token: string; result: VerbaResult }> {
  const { table, snapshotId } = await resolveIndexTable()
  const result = calculateVacationAnd13th(params.input, table)

  const token = await persist({
    kind: 'ferias_13',
    engineVersion: VACATION_13TH_ENGINE_VERSION,
    input: params.input,
    result,
    snapshotId,
    common: params,
  })

  return { token, result }
}
