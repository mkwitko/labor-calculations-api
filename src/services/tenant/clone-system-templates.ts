import type { DocumentTemplateType } from '@prisma/client'
import type { PrismaTransactionClient } from 'prisma/prisma'
import { SYSTEM_TEMPLATE_MANIFEST } from 'prisma/templates/manifest'

/**
 * Dá à organização suas próprias linhas dos templates de sistema.
 *
 * As linhas são por organização; o arquivo `.docx` não é. Todas apontam para o
 * mesmo `fileKey` no R2, publicado uma única vez por
 * `prisma/seed-document-templates.ts`. Replicar a linha é o que permite à
 * extension de tenant manter uma regra só — toda linha de modelo tenant tem
 * `organizationId` — em vez de abrir exceção para linha global.
 *
 * Nunca chamar de dentro de um contexto de organização ativo diferente de
 * `organizationId`: a extension de tenant sobrescreveria o `organizationId`
 * dos templates com a organização ativa, corrompendo o tenant dessas linhas
 * em silêncio. Rode fora do contexto, com `systemPrisma` (é o que
 * `createPersonalOrganization` garante ao chamar esta função).
 */
export async function cloneSystemTemplates(
  tx: PrismaTransactionClient,
  organizationId: string,
): Promise<number> {
  const result = await tx.documentTemplate.createMany({
    data: SYSTEM_TEMPLATE_MANIFEST.map((t) => ({
      organizationId,
      name: t.name,
      description: t.description,
      type: t.type as DocumentTemplateType,
      isSystem: true,
      fileKey: `templates/system/${t.type}-v${t.version}.docx`,
      currentVersion: t.version,
    })),
  })

  return result.count
}
