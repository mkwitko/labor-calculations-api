import { prisma } from 'prisma/prisma'
import { describe, expect, it } from 'vitest'
import { runAsOrganization } from './tenant-context'

// The pure `withOrganizationScope` tests in tenant-scope.test.ts cover the
// argument-rewriting logic in isolation, but they cannot catch a wiring bug:
// `$allModels.$allOperations` never sees raw queries in the first place —
// Prisma looks them up under a separate top-level key. These tests exercise
// the real, scoped `prisma` client from `prisma/prisma.ts` to make sure the
// sibling `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe`
// handlers actually reject, instead of trusting that `$allOperations` alone
// is enough.
describe('withOrganizationScope wiring (integration)', () => {
  it('rejeita $queryRawUnsafe no client com escopo, sem contexto', async () => {
    await expect(prisma.$queryRawUnsafe('SELECT 1')).rejects.toThrow(/raw/i)
  })

  it('rejeita $queryRawUnsafe no client com escopo, mesmo com contexto ativo', async () => {
    await runAsOrganization('org_1', async () => {
      await expect(
        prisma.$queryRawUnsafe('SELECT count(*) FROM "Case"'),
      ).rejects.toThrow(/raw/i)
    })
  })

  it('rejeita $executeRawUnsafe no client com escopo', async () => {
    await expect(prisma.$executeRawUnsafe('SELECT 1')).rejects.toThrow(/raw/i)
  })

  it('rejeita modelo tenant sem contexto com a mensagem do TenantContextMissingException', async () => {
    // Under ENV=test the pre-existing error-handling extension short-circuits
    // and does not wrap thrown errors into PrismaException/HttpException, so
    // this surfaces the real TenantContextMissingException message — the one
    // Task 11's leak test matches against.
    await expect(prisma.case.findMany()).rejects.toThrow(
      /sem contexto de organização/,
    )
  })
})
