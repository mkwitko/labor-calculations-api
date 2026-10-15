import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAsOrganization } from '@/lib/tenant-context'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { createPersonalOrganization } from './create-organization'

describe('createPersonalOrganization', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('usa o nome do escritório quando informado', async () => {
    const { user } = await createTestUser({ name: 'Ana Souza' })

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'Ana Souza',
      officeName: 'Souza Advocacia',
      phone: null,
    })

    expect(org.name).toBe('Souza Advocacia')
  })

  it('cai no nome da pessoa quando não há escritório', async () => {
    const { user } = await createTestUser({ name: 'Ana Souza' })

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'Ana Souza',
      officeName: null,
      phone: null,
    })

    expect(org.name).toBe('Carteira de Ana Souza')
  })

  it('torna o criador owner com um assento', async () => {
    const { user } = await createTestUser()

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'Ana',
      officeName: null,
      phone: null,
    })

    const membership = await systemPrisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
    })

    expect(membership?.role).toBe('owner')
    expect(org.seats).toBe(1)
  })

  it('gera slugs distintos para nomes iguais', async () => {
    const { user: a } = await createTestUser()
    const { user: b } = await createTestUser()

    const first = await createPersonalOrganization(systemPrisma, {
      userId: a.id,
      name: 'Silva',
      officeName: 'Silva & Associados',
      phone: null,
    })
    const second = await createPersonalOrganization(systemPrisma, {
      userId: b.id,
      name: 'Silva',
      officeName: 'Silva & Associados',
      phone: null,
    })

    expect(first.slug).not.toBe(second.slug)
    expect(first.slug.startsWith('silva-associados')).toBe(true)
  })

  it('remove acentos do slug', async () => {
    const { user } = await createTestUser()

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'João',
      officeName: 'Escritório Assunção',
      phone: null,
    })

    expect(org.slug.startsWith('escritorio-assuncao')).toBe(true)
  })

  it('dá à organização os doze templates de sistema', async () => {
    const { user } = await createTestUser()

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'Ana',
      officeName: null,
      phone: null,
    })

    const templates = await systemPrisma.documentTemplate.findMany({
      where: { organizationId: org.id, isSystem: true },
      select: { name: true, fileKey: true },
    })

    expect(templates).toHaveLength(12)
    expect(
      templates.every((t) => t.fileKey?.startsWith('templates/system/')),
    ).toBe(true)
  })

  it('não compartilha linha de template entre organizações', async () => {
    const a = await createTestUser()
    const b = await createTestUser()

    const rows = await systemPrisma.documentTemplate.findMany({
      where: { organizationId: { in: [a.organization.id, b.organization.id] } },
      select: { id: true },
    })

    expect(rows).toHaveLength(24)
    expect(new Set(rows.map((t) => t.id)).size).toBe(24)
  })

  it('grava o telefone informado na organização', async () => {
    const { user } = await createTestUser()

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'Ana',
      officeName: null,
      phone: '11987654321',
    })

    expect(org.phone).toBe('11987654321')
  })

  it('aceita telefone nulo', async () => {
    const { user } = await createTestUser()

    const org = await createPersonalOrganization(systemPrisma, {
      userId: user.id,
      name: 'Ana',
      officeName: null,
      phone: null,
    })

    expect(org.phone).toBeNull()
  })

  it('recusa rodar dentro de um contexto de organização ativo', async () => {
    const { user } = await createTestUser()

    await expect(
      runAsOrganization('org_qualquer', () =>
        createPersonalOrganization(systemPrisma, {
          userId: user.id,
          name: 'Ana',
          officeName: null,
          phone: null,
        }),
      ),
    ).rejects.toThrow(/contexto de organização/)
  })
})
