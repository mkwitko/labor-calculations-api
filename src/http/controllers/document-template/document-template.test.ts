import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

async function getAuthToken(userId: string): Promise<string> {
  return app.jwt.sign({ sub: userId })
}

describe('POST /document-templates', () => {
  it('creates a custom document template', async () => {
    const { user } = await createTestUser()
    const token = await getAuthToken(user.id)

    const response = await app.inject({
      method: 'POST',
      url: '/document-templates',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Meu Template',
        description: 'Template customizado',
        type: 'customizado',
      },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.name).toBe('Meu Template')
    expect(body.type).toBe('customizado')
    expect(body.fileKey).toBeNull()
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/document-templates',
      payload: { name: 'Test' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 400 with empty name', async () => {
    const { user } = await createTestUser()
    const token = await getAuthToken(user.id)

    const response = await app.inject({
      method: 'POST',
      url: '/document-templates',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: '' },
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /document-templates', () => {
  it('lists system and user templates', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    await systemPrisma.documentTemplate.create({
      data: {
        name: 'Sistema',
        type: 'parecer_tecnico',
        isSystem: true,
        organizationId: organization.id,
      },
    })

    await systemPrisma.documentTemplate.create({
      data: {
        userId: user.id,
        name: 'Meu',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/document-templates',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // 12 doze templates de sistema clonados por createTestUser + 1 sistema + 1 próprio
    expect(body).toHaveLength(14)
  })

  it('filters by type', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    await systemPrisma.documentTemplate.create({
      data: {
        name: 'Parecer',
        type: 'parecer_tecnico',
        isSystem: true,
        organizationId: organization.id,
      },
    })

    await systemPrisma.documentTemplate.create({
      data: {
        name: 'Petição',
        type: 'peticao_inicial',
        isSystem: true,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/document-templates?type=parecer_tecnico',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // 1 dos doze templates de sistema clonados por createTestUser já é
    // parecer_tecnico, mais o criado manualmente acima.
    expect(body).toHaveLength(2)
    expect(
      body.every((t: { type: string }) => t.type === 'parecer_tecnico'),
    ).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/document-templates',
    })

    expect(response.statusCode).toBe(401)
  })

  it('mostra ao colega o template criado por outro membro da organização', async () => {
    const { user: user1 } = await createTestUser({
      mail: 'user1@test.com',
      oabNumber: 'SP/111',
      document: '111',
    })
    const { user: user2, organization } = await createTestUser({
      mail: 'user2@test.com',
      oabNumber: 'SP/222',
      document: '222',
    })
    const token2 = await getAuthToken(user2.id)

    // Modelo de peça é do escritório: quem entra na organização herda o
    // acervo. Antes do Plano 2A o filtro era por pessoa, o que escondia do
    // associado o modelo que o sócio escreveu.
    await systemPrisma.documentTemplate.create({
      data: {
        userId: user1.id,
        name: 'Modelo do sócio',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    await systemPrisma.documentTemplate.create({
      data: {
        name: 'Sistema',
        type: 'parecer_tecnico',
        isSystem: true,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/document-templates',
      headers: { authorization: `Bearer ${token2}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // 12 templates de sistema clonados por createTestUser + 1 sistema manual
    // + o modelo do outro membro, agora visível.
    expect(body).toHaveLength(14)
    expect(
      body.some((t: { name: string }) => t.name === 'Modelo do sócio'),
    ).toBe(true)
    expect(body.some((t: { name: string }) => t.name === 'Sistema')).toBe(true)
  })

  it('não mostra template de outra organização', async () => {
    const { organization: otherOrganization } = await createTestUser({
      mail: 'outra@test.com',
      oabNumber: 'SP/333',
      document: '333',
    })
    const { user: member } = await createTestUser({
      mail: 'membro@test.com',
      oabNumber: 'SP/444',
      document: '444',
    })
    const token = await getAuthToken(member.id)

    await systemPrisma.documentTemplate.create({
      data: {
        name: 'Modelo de fora',
        type: 'customizado',
        isSystem: false,
        organizationId: otherOrganization.id,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/document-templates',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(
      response
        .json()
        .some((t: { name: string }) => t.name === 'Modelo de fora'),
    ).toBe(false)
  })
})

describe('GET /document-templates/:id', () => {
  it('returns a template by id', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        userId: user.id,
        name: 'Meu Template',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/document-templates/${template.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.id).toBe(template.id)
    expect(body.name).toBe('Meu Template')
  })

  it('returns 404 for non-existent template', async () => {
    const { user } = await createTestUser()
    const token = await getAuthToken(user.id)

    const response = await app.inject({
      method: 'GET',
      url: '/document-templates/clxxxxnonexistent',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/document-templates/clxxxx',
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('PATCH /document-templates/:id', () => {
  it('updates a custom template name and description', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        userId: user.id,
        name: 'Original',
        description: 'Desc original',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: `/document-templates/${template.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Atualizado',
        description: 'Nova descrição',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.name).toBe('Atualizado')
    expect(body.description).toBe('Nova descrição')
  })

  it('cannot update a system template', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        name: 'Sistema',
        type: 'parecer_tecnico',
        isSystem: true,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: `/document-templates/${template.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Hacked' },
    })

    expect(response.statusCode).toBe(404)
  })

  it('cannot update another users template', async () => {
    const { user: user1, organization } = await createTestUser({
      mail: 'u1@test.com',
      oabNumber: 'SP/111',
      document: '111',
    })
    const { user: user2 } = await createTestUser({
      mail: 'u2@test.com',
      oabNumber: 'SP/222',
      document: '222',
    })
    const token2 = await getAuthToken(user2.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        userId: user1.id,
        name: 'Privado',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: `/document-templates/${template.id}`,
      headers: { authorization: `Bearer ${token2}` },
      payload: { name: 'Hacked' },
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('DELETE /document-templates/:id', () => {
  it('deletes a custom template', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        userId: user.id,
        name: 'Para deletar',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'DELETE',
      url: `/document-templates/${template.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(204)

    const found = await systemPrisma.documentTemplate.findUnique({
      where: { id: template.id },
    })
    expect(found).toBeNull()
  })

  it('cannot delete a system template', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        name: 'Sistema',
        type: 'parecer_tecnico',
        isSystem: true,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'DELETE',
      url: `/document-templates/${template.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/document-templates/clxxxx',
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('POST /document-templates/:id/upload-url', () => {
  it('returns presigned upload url for a template', async () => {
    const { user, organization } = await createTestUser()
    const token = await getAuthToken(user.id)

    const template = await systemPrisma.documentTemplate.create({
      data: {
        userId: user.id,
        name: 'Com upload',
        type: 'customizado',
        isSystem: false,
        organizationId: organization.id,
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/document-templates/${template.id}/upload-url`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1024,
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.uploadUrl).toBeDefined()
    expect(body.fileKey).toBeDefined()
  })

  it('returns 404 for non-existent template', async () => {
    const { user } = await createTestUser()
    const token = await getAuthToken(user.id)

    const response = await app.inject({
      method: 'POST',
      url: '/document-templates/clxxxxnonexistent/upload-url',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1024,
      },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/document-templates/clxxxx/upload-url',
      payload: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1024,
      },
    })

    expect(response.statusCode).toBe(401)
  })
})
