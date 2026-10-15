import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { brandingForOrganization } from './organization-branding'

describe('organization branding', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('devolve a marca da organização', async () => {
    const { organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: {
        name: 'Souza Advocacia',
        logoUrl: 'https://cdn/logo.png',
        letterheadUrl: 'https://cdn/timbre.png',
        brandPrimaryColor: '#123456',
        address: 'Rua A, 1',
        website: 'https://lawfirm.example.com',
        phone: '11999990000',
      },
    })

    expect(await brandingForOrganization(organization.id)).toEqual({
      officeName: 'Souza Advocacia',
      logoUrl: 'https://cdn/logo.png',
      letterheadUrl: 'https://cdn/timbre.png',
      brandPrimaryColor: '#123456',
      address: 'Rua A, 1',
      website: 'https://lawfirm.example.com',
      phone: '11999990000',
    })
  })

  it('devolve null para organização inexistente', async () => {
    expect(await brandingForOrganization('org_nao_existe')).toBeNull()
  })
})
