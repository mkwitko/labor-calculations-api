import type { ActivityKind } from '@prisma/client'
import { prisma } from 'prisma/prisma'
import { requireOrganizationId } from '@/lib/tenant-context'

type ActivityPayload = Record<string, unknown>

export async function recordActivity(params: {
  caseId: string
  userId: string
  kind: ActivityKind
  payload?: ActivityPayload
}): Promise<void> {
  await prisma.activity.create({
    data: {
      caseId: params.caseId,
      organizationId: requireOrganizationId(),
      userId: params.userId,
      kind: params.kind,
      payload: params.payload ?? {},
    },
  })
}
