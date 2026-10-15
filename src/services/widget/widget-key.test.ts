import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import {
  getWidgetKey,
  issueWidgetKey,
  resolveWidgetBranding,
  revokeWidgetKey,
} from './widget-key'

describe('widgetKey', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('emite uma chave e resolve a organização por ela', async () => {
    const { organization } = await createTestUser()

    const key = await issueWidgetKey(organization.id)

    expect(key.length).toBeGreaterThan(20)
    await expect(resolveWidgetBranding(key)).resolves.toMatchObject({
      organizationId: organization.id,
      officeName: organization.name,
    })
  })

  it('rotacionar invalida a chave anterior', async () => {
    const { organization } = await createTestUser()

    const first = await issueWidgetKey(organization.id)
    const second = await issueWidgetKey(organization.id)

    expect(second).not.toBe(first)
    await expect(resolveWidgetBranding(first)).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(resolveWidgetBranding(second)).resolves.toMatchObject({
      organizationId: organization.id,
    })
  })

  it('desligar apaga a chave', async () => {
    const { organization } = await createTestUser()
    const key = await issueWidgetKey(organization.id)

    await revokeWidgetKey(organization.id)

    expect(await getWidgetKey(organization.id)).toBeNull()
    await expect(resolveWidgetBranding(key)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('recusa chave desconhecida', async () => {
    await expect(
      resolveWidgetBranding('chave-que-nunca-existiu'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  // O widget vive no site de terceiro: continuar respondendo depois de a conta
  // sumir manteria o wizard de pé em nome de um escritório que não existe mais.
  it('recusa chave de organização apagada', async () => {
    const { organization } = await createTestUser()
    const key = await issueWidgetKey(organization.id)

    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: { deletedAt: new Date() },
    })

    await expect(resolveWidgetBranding(key)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('devolve a marca do escritório para a página do iframe', async () => {
    const { organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: { logoUrl: 'https://cdn/logo.png', brandPrimaryColor: '#123456' },
    })

    const key = await issueWidgetKey(organization.id)

    await expect(resolveWidgetBranding(key)).resolves.toMatchObject({
      logoUrl: 'https://cdn/logo.png',
      brandPrimaryColor: '#123456',
    })
  })
})
