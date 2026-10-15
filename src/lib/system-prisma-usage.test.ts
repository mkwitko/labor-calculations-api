import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Arquivos que rodam fora de um request e portanto não têm contexto de tenant.
const SYSTEM_FILES = [
  'src/services/referral/cashback.ts',
  'src/services/referral/reconcile.ts',
  'src/services/billing/sync-subscription.ts',
  'src/http/controllers/billing/webhook.ts',
  'src/services/reminders/reminder-service.ts',
  'src/services/documents/purge-service.ts',
  'src/services/monetary-index/sync-monetary-indices.ts',
]

describe('contextos de sistema', () => {
  it('não importam o client com escopo de tenant', () => {
    const offenders = SYSTEM_FILES.filter((file) => {
      const source = readFileSync(file, 'utf8')

      // Lookbehind (not the brief's lookahead) is what actually distinguishes
      // "import { prisma }" (bad: the tenant-scoped client) from
      // "import { systemPrisma as prisma }" (fine: `prisma` is just the local
      // alias for `systemPrisma`, not the import specifier). A trailing
      // `(?!\s+as)` matches both forms indiscriminately, since it only looks
      // ahead of the match and "as" never follows the *last* token in either
      // case.
      return /import\s*\{[^}]*(?<!as\s)\bprisma\b[^}]*\}\s*from\s*['"]prisma\/prisma['"]/.test(
        source,
      )
    })

    expect(offenders).toEqual([])
  })
})
