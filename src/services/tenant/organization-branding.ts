import { systemPrisma } from 'prisma/prisma'

export type OrganizationBranding = {
  officeName: string
  logoUrl: string | null
  letterheadUrl: string | null
  brandPrimaryColor: string | null
  address: string | null
  website: string | null
  phone: string | null
}

const BRANDING_SELECT = {
  name: true,
  logoUrl: true,
  letterheadUrl: true,
  brandPrimaryColor: true,
  address: true,
  website: true,
  phone: true,
} as const

/**
 * Identidade visual do escritório. Papel timbrado, logotipo e cor pertencem à
 * organização, não à pessoa: dois advogados do mesmo escritório emitem peça
 * com o mesmo timbre.
 *
 * `systemPrisma` porque `Organization` não é modelo tenant e porque parte dos
 * chamadores (geração de documento, link público de cálculo) roda fora de um
 * contexto de organização.
 */
export async function brandingForOrganization(
  organizationId: string,
): Promise<OrganizationBranding | null> {
  const org = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: BRANDING_SELECT,
  })

  if (!org) return null

  const { name, ...rest } = org

  return { officeName: name, ...rest }
}
