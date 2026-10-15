import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { cleanDatabase, createMember, createTestUser } from '@/tests/helpers/db'

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

function authToken(userId: string, isAdmin = false): string {
  return app.jwt.sign({ sub: userId, isAdmin })
}

async function openTicket(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: '/support/tickets',
    headers: { authorization: `Bearer ${authToken(userId)}` },
    payload: {
      kind: 'duvida',
      subject: 'Cálculo de férias diverge',
      body: 'O valor do terço constitucional parece diferente do que esperava.',
      context: { path: '/calculations/new' },
      ...overrides,
    },
  })

  expect(res.statusCode).toBe(201)

  return res.json().id as string
}

async function makeAdmin(userId: string) {
  await systemPrisma.user.update({
    where: { id: userId },
    data: { isAdmin: true },
  })
}

describe('POST /support/tickets', () => {
  it('abre o chamado com a primeira mensagem e o contexto da tela', async () => {
    const { user } = await createTestUser()

    const ticketId = await openTicket(user.id)

    const ticket = await systemPrisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { messages: true },
    })

    expect(ticket.status).toBe('aberto')
    expect(ticket.messages).toHaveLength(1)
    expect(ticket.messages[0].fromStaff).toBe(false)
    expect(ticket.context).toMatchObject({ path: '/calculations/new' })
  })

  it('recusa assunto vazio', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { kind: 'sugestao', subject: '', body: 'texto' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('exige autenticação', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      payload: { kind: 'duvida', subject: 'Assunto', body: 'texto' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /support/tickets', () => {
  it('mostra ao colega o chamado que outra pessoa do escritório abriu', async () => {
    const { user, organization } = await createTestUser()
    const colleague = await createMember(organization.id, 'lawyer')

    await openTicket(user.id)

    const res = await app.inject({
      method: 'GET',
      url: '/support/tickets',
      headers: { authorization: `Bearer ${authToken(colleague.user.id)}` },
    })

    // O chamado é do escritório: quem abriu pode sair da organização no meio da
    // conversa e o assunto continua sendo de quem ficou.
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('não vaza chamado de outra organização', async () => {
    const { user } = await createTestUser()
    await openTicket(user.id)

    const outsider = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/support/tickets',
      headers: { authorization: `Bearer ${authToken(outsider.user.id)}` },
    })

    expect(res.json()).toHaveLength(0)
  })

  it('recusa o acesso direto ao chamado de outra organização', async () => {
    const { user } = await createTestUser()
    const ticketId = await openTicket(user.id)

    const outsider = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: `/support/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${authToken(outsider.user.id)}` },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('conversa', () => {
  it('resposta do atendimento conta como não lida até o chamado ser aberto', async () => {
    const { user } = await createTestUser()
    const ticketId = await openTicket(user.id)
    await makeAdmin(user.id)

    await app.inject({
      method: 'POST',
      url: `/admin/support/tickets/${ticketId}/messages`,
      headers: { authorization: `Bearer ${authToken(user.id, true)}` },
      payload: { body: 'Pode mandar o id do cálculo?' },
    })

    const before = await app.inject({
      method: 'GET',
      url: '/support/unread-count',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(before.json().unread).toBe(1)

    await app.inject({
      method: 'GET',
      url: `/support/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    const after = await app.inject({
      method: 'GET',
      url: '/support/unread-count',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(after.json().unread).toBe(0)
  })

  it('responder um chamado encerrado reabre o assunto', async () => {
    const { user } = await createTestUser()
    const ticketId = await openTicket(user.id)

    await app.inject({
      method: 'POST',
      url: `/support/tickets/${ticketId}/close`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    await app.inject({
      method: 'POST',
      url: `/support/tickets/${ticketId}/messages`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: { body: 'Voltou a acontecer.' },
    })

    const ticket = await systemPrisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
    })

    expect(ticket.status).toBe('aberto')
    expect(ticket.closedAt).toBeNull()
  })
})

describe('fila do atendimento', () => {
  it('recusa quem não é admin', async () => {
    const { user } = await createTestUser()

    const res = await app.inject({
      method: 'GET',
      url: '/admin/support/tickets',
      headers: { authorization: `Bearer ${authToken(user.id)}` },
    })

    expect(res.statusCode).toBe(403)
  })

  it('enxerga chamados de todas as organizações, com plano e autor', async () => {
    const first = await createTestUser()
    await openTicket(first.user.id)

    const second = await createTestUser()
    await openTicket(second.user.id, {
      kind: 'sugestao',
      subject: 'Importar planilha do TRT',
    })

    const admin = await createTestUser()
    await makeAdmin(admin.user.id)

    const res = await app.inject({
      method: 'GET',
      url: '/admin/support/tickets',
      headers: { authorization: `Bearer ${authToken(admin.user.id, true)}` },
    })

    expect(res.statusCode).toBe(200)

    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body[0].organization.planCode).toBe('solo')
    expect(body[0].author.mail).toBeTruthy()
  })

  it('responder chamado joga para "aguardando você"; sugestão fica no estágio', async () => {
    const { user } = await createTestUser()
    const question = await openTicket(user.id)
    const idea = await openTicket(user.id, {
      kind: 'sugestao',
      subject: 'Importar planilha do TRT',
    })

    const admin = await createTestUser()
    await makeAdmin(admin.user.id)
    const headers = {
      authorization: `Bearer ${authToken(admin.user.id, true)}`,
    }

    await app.inject({
      method: 'POST',
      url: `/admin/support/tickets/${question}/messages`,
      headers,
      payload: { body: 'Consegue mandar o print?' },
    })

    await app.inject({
      method: 'POST',
      url: `/admin/support/tickets/${idea}/messages`,
      headers,
      payload: { body: 'Boa ideia, anotado.' },
    })

    const [questionRow, ideaRow] = await Promise.all([
      systemPrisma.supportTicket.findUniqueOrThrow({ where: { id: question } }),
      systemPrisma.supportTicket.findUniqueOrThrow({ where: { id: idea } }),
    ])

    expect(questionRow.status).toBe('aguardando_usuario')
    // Sugestão anda quando o desenvolvimento anda, não porque foi comentada.
    expect(ideaRow.status).toBe('aberto')
  })

  it('muda o estágio da sugestão e marca o fechamento', async () => {
    const { user } = await createTestUser()
    const ticketId = await openTicket(user.id, {
      kind: 'sugestao',
      subject: 'Importar planilha do TRT',
    })

    const admin = await createTestUser()
    await makeAdmin(admin.user.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/support/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${authToken(admin.user.id, true)}` },
      payload: { status: 'concluido' },
    })

    expect(res.statusCode).toBe(200)

    const ticket = await systemPrisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
    })

    expect(ticket.status).toBe('concluido')
    expect(ticket.closedAt).not.toBeNull()
  })
})

describe('anexos', () => {
  it('assina a URL de upload e recusa tipo fora da whitelist', async () => {
    const { user } = await createTestUser()
    const headers = { authorization: `Bearer ${authToken(user.id)}` }

    const ok = await app.inject({
      method: 'POST',
      url: '/support/upload-url',
      headers,
      payload: {
        fileName: 'print.png',
        mimeType: 'image/png',
        sizeBytes: 120_000,
      },
    })

    expect(ok.statusCode).toBe(200)
    expect(ok.json().fileKey).toMatch(/^support\/.+\.png$/)

    // SVG e HTML ficam de fora de propósito: servidos do nosso domínio, viram
    // XSS com a sessão de quem abre o anexo.
    const refused = await app.inject({
      method: 'POST',
      url: '/support/upload-url',
      headers,
      payload: {
        fileName: 'payload.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: 900,
      },
    })

    expect(refused.statusCode).toBe(400)
  })

  it('grava o anexo da resposta e devolve URL assinada na conversa', async () => {
    const { user } = await createTestUser()
    const ticketId = await openTicket(user.id)
    const headers = { authorization: `Bearer ${authToken(user.id)}` }

    const sent = await app.inject({
      method: 'POST',
      url: `/support/tickets/${ticketId}/messages`,
      headers,
      payload: {
        body: 'Segue o print da tela.',
        attachments: [
          {
            fileKey: 'support/org/print.png',
            fileName: 'print.png',
            mimeType: 'image/png',
            sizeBytes: 120_000,
          },
        ],
      },
    })

    expect(sent.statusCode).toBe(201)

    const res = await app.inject({
      method: 'GET',
      url: `/support/tickets/${ticketId}`,
      headers,
    })

    const [, reply] = res.json().messages

    expect(reply.attachments).toHaveLength(1)
    expect(reply.attachments[0].fileName).toBe('print.png')
    expect(reply.attachments[0].url).toContain('X-Amz-Signature')
    // A chave do bucket nunca sai para a tela.
    expect(reply.attachments[0].fileKey).toBeUndefined()
  })

  it('recusa mais de cinco arquivos numa fala', async () => {
    const { user } = await createTestUser()
    const ticketId = await openTicket(user.id)

    const res = await app.inject({
      method: 'POST',
      url: `/support/tickets/${ticketId}/messages`,
      headers: { authorization: `Bearer ${authToken(user.id)}` },
      payload: {
        body: 'Vários arquivos',
        attachments: Array.from({ length: 6 }, (_, index) => ({
          fileKey: `support/org/${index}.png`,
          fileName: `${index}.png`,
          mimeType: 'image/png',
          sizeBytes: 1_000,
        })),
      },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('atendimento prioritário', () => {
  it('marca o chamado do plano grande e o põe na frente da fila', async () => {
    const solo = await createTestUser()
    const grande = await createTestUser()

    await systemPrisma.organization.update({
      where: { id: grande.organization.id },
      data: { planCode: 'escritorio' },
    })

    // O do plano pequeno é o mais recente: sem prioridade, viria primeiro.
    await openTicket(grande.user.id, { subject: 'Erro no relatório' })
    await openTicket(solo.user.id, { subject: 'Dúvida de cadastro' })

    const admin = await createTestUser()
    await makeAdmin(admin.user.id)

    const res = await app.inject({
      method: 'GET',
      url: '/admin/support/tickets',
      headers: { authorization: `Bearer ${authToken(admin.user.id, true)}` },
    })

    const queue = res.json()

    expect(queue[0].subject).toBe('Erro no relatório')
    expect(queue[0].priority).toBe(true)
    expect(queue[1].priority).toBe(false)
  })
})
