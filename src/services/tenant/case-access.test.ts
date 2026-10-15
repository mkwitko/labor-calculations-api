import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runAsOrganization } from '@/lib/tenant-context'
import { cleanDatabase, createOrganizationWithRoles } from '@/tests/helpers/db'
import {
  assertCaseVisible,
  assertCaseWritable,
  assertFinanceAccess,
} from './case-access'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

/**
 * Asserção por `statusCode`, não por `instanceof`: neste setup de Vitest a
 * classe importada pelo teste e a importada pelo módulo sob teste são
 * instâncias de módulo diferentes, então `rejects.toThrow(Classe)` falha mesmo
 * com a exceção certa. 404 = invisível, 403 = verbo negado.
 */
async function statusOf(fn: () => Promise<unknown>) {
  try {
    await fn()
    return undefined
  } catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}

async function scenario() {
  const roles = await createOrganizationWithRoles()

  const lawyerCase = await systemPrisma.case.create({
    data: {
      title: 'Caso do associado',
      assignedToId: roles.lawyer.id,
      organizationId: roles.organization.id,
    },
    select: { id: true },
  })

  const ownerCase = await systemPrisma.case.create({
    data: {
      title: 'Caso do owner',
      assignedToId: roles.owner.id,
      organizationId: roles.organization.id,
    },
    select: { id: true },
  })

  return { ...roles, lawyerCase, ownerCase }
}

function actor(
  s: Awaited<ReturnType<typeof scenario>>,
  who: 'owner' | 'admin' | 'lawyer' | 'staff' | 'intern',
) {
  return {
    userId: s[who].id,
    organizationId: s.organization.id,
    role: who,
  } as const
}

describe('assertCaseVisible', () => {
  it('deixa o owner ver caso de outro membro', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseVisible(actor(s, 'owner'), s.lawyerCase.id),
        ),
      ).toBeUndefined()
    })
  })

  it('deixa o staff ver caso de outro membro', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseVisible(actor(s, 'staff'), s.lawyerCase.id),
        ),
      ).toBeUndefined()
    })
  })

  it('esconde do lawyer o caso que não é dele — 404, não 403', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseVisible(actor(s, 'lawyer'), s.ownerCase.id),
        ),
      ).toBe(404)
    })
  })

  it('deixa o lawyer ver o caso atribuído a ele', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseVisible(actor(s, 'lawyer'), s.lawyerCase.id),
        ),
      ).toBeUndefined()
    })
  })
})

describe('assertCaseWritable', () => {
  it('deixa o lawyer escrever no caso dele', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseWritable(actor(s, 'lawyer'), s.lawyerCase.id),
        ),
      ).toBeUndefined()
    })
  })

  it('recusa escrita do staff com 403 — ele enxerga, mas não edita', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseWritable(actor(s, 'staff'), s.lawyerCase.id),
        ),
      ).toBe(403)
    })
  })

  it('recusa escrita do intern no caso atribuído a ele com 403', async () => {
    const s = await scenario()
    const internCase = await systemPrisma.case.create({
      data: {
        title: 'Caso do estagiário',
        assignedToId: s.intern.id,
        organizationId: s.organization.id,
      },
      select: { id: true },
    })
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseWritable(actor(s, 'intern'), internCase.id),
        ),
      ).toBe(403)
    })
  })

  it('recusa com 404, não 403, quando o caso é invisível para o papel', async () => {
    const s = await scenario()
    await runAsOrganization(s.organization.id, async () => {
      expect(
        await statusOf(() =>
          assertCaseWritable(actor(s, 'lawyer'), s.ownerCase.id),
        ),
      ).toBe(404)
    })
  })
})

describe('assertFinanceAccess', () => {
  it('libera owner, admin e staff', async () => {
    const s = await scenario()
    for (const who of ['owner', 'admin', 'staff'] as const) {
      expect(() => assertFinanceAccess(actor(s, who))).not.toThrow()
    }
  })

  it('bloqueia lawyer e intern', async () => {
    const s = await scenario()
    for (const who of ['lawyer', 'intern'] as const) {
      expect(() => assertFinanceAccess(actor(s, who))).toThrow(/financeiro/)
    }
  })
})
