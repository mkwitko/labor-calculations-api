import type { OrgRole } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '@/app'
import { hashInviteToken } from '@/services/tenant/invite-token'
import {
  cleanDatabase,
  createMember,
  createOrganizationWithRoles,
} from '@/tests/helpers/db'

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

type Ctx = {
  organizationId: string
  actingUserId: string
  ownerCaseId: string
  ownerCalculationId: string
  settlementId: string
  /** Membro criado só para ser alvo: nunca é o requisitante nem o titular. */
  targetMembershipId: string
  targetUserId: string
  pendingInviteId: string
  /** Token de um cálculo feito na calculadora pública, ainda não importado. */
  publicCalculationToken: string
  /** Cálculo vindo do widget da própria organização, ainda não importado. */
  widgetCalculationId: string
  /** Demonstrativo de uma linha de avaliação de passivo do owner. */
  batchRowUrl: string
}

/**
 * A matriz do spec, endpoint por endpoint. `allowed` lista os papéis que devem
 * conseguir; todos os outros devem receber 403 (verbo negado) ou 404
 * (invisível). Endpoint novo com regra de papel entra aqui — é este arquivo, e
 * não a memória de quem revisa, que guarda a matriz.
 */
type Row = {
  label: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: (ctx: Ctx) => string
  payload?: Record<string, unknown>
  /** Corpo que depende da fixture — ids só existem depois dela. */
  body?: (ctx: Ctx) => Record<string, unknown>
  allowed: OrgRole[]
}

const ROWS: Row[] = [
  {
    // Chave de API é credencial de faturamento: quem não administra a
    // organização não cria gasto nem porta de entrada.
    label: 'criar chave de API',
    method: 'POST',
    url: () => '/api-keys',
    payload: { name: 'ERP' },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'listar chaves de API',
    method: 'GET',
    url: () => '/api-keys',
    allowed: ['owner', 'admin'],
  },
  {
    // Consumo é informação de fatura: mesmo gate das chaves.
    label: 'ler consumo da API',
    method: 'GET',
    url: () => '/api-keys/usage',
    allowed: ['owner', 'admin'],
  },
  {
    // O caso da fixture é do titular. Associado e estagiário não enxergam caso
    // de colega, então recebem 404 aqui — a thread herda a visibilidade do
    // caso, sem regra própria.
    label: 'ler mensagens do caso',
    method: 'GET',
    url: (c) => `/cases/${c.ownerCaseId}/messages`,
    allowed: ['owner', 'admin', 'staff'],
  },
  {
    // Falar com o cliente é ato de quem escreve no caso (owner, admin,
    // lawyer). Sobre o caso do titular, sobram owner e admin: o financeiro
    // enxerga mas não escreve, e o associado nem enxerga.
    label: 'enviar mensagem ao cliente',
    method: 'POST',
    url: (c) => `/cases/${c.ownerCaseId}/messages`,
    payload: { body: 'olá' },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'marcar mensagens como lidas',
    method: 'POST',
    url: (c) => `/cases/${c.ownerCaseId}/messages/read`,
    allowed: ['owner', 'admin', 'staff'],
  },
  {
    label: 'pedir URL de upload de anexo de mensagem',
    method: 'POST',
    url: (c) => `/cases/${c.ownerCaseId}/messages/upload-url`,
    payload: {
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'registrar anexo de mensagem',
    method: 'POST',
    url: (c) => `/cases/${c.ownerCaseId}/messages/attachments`,
    payload: {
      fileKey: 'messages/x/y.pdf',
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'contagem de mensagens não lidas',
    method: 'GET',
    url: () => '/messages/unread-count',
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    label: 'listar casos',
    method: 'GET',
    url: () => '/cases',
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    // Todo papel consulta a própria próxima ação; o que muda por papel é o
    // conteúdo, e isso get-next-action.test.ts cobre. A linha existe para que o
    // endpoint não fique fora da matriz.
    label: 'próxima ação do painel',
    method: 'GET',
    url: () => '/dashboard/next-action',
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    label: 'importar cálculo da calculadora pública',
    method: 'POST',
    url: (c) => `/public/calculations/${c.publicCalculationToken}/claim`,
    allowed: ['owner', 'admin', 'lawyer'],
  },
  {
    // A fila do widget é leitura, como listar cálculos: todo papel vê. O que
    // muda por papel é importar.
    label: 'listar cálculos do widget',
    method: 'GET',
    url: () => '/widget/calculations',
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    label: 'importar cálculo do widget',
    method: 'POST',
    url: (c) => `/widget/calculations/${c.widgetCalculationId}/claim`,
    allowed: ['owner', 'admin', 'lawyer'],
  },
  {
    // A chave vai para o HTML do site do escritório e rotacionar derruba o
    // snippet publicado: fica com quem responde pela organização.
    label: 'ver a chave do widget',
    method: 'GET',
    url: (c) => `/organizations/${c.organizationId}/widget-key`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'ligar ou rotacionar a chave do widget',
    method: 'POST',
    url: (c) => `/organizations/${c.organizationId}/widget-key`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'desligar o widget',
    method: 'DELETE',
    url: (c) => `/organizations/${c.organizationId}/widget-key`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'criar avaliação de passivo em lote',
    method: 'POST',
    url: () => '/batch-assessments',
    payload: {
      name: 'Matriz de papéis',
      rows: [
        {
          reference: '001',
          terminationType: 'sem_justa_causa',
          startDate: '2020-01-10',
          endDate: '2024-06-20',
          lastSalary: 3000,
        },
      ],
    },
    allowed: ['owner', 'admin', 'lawyer'],
  },
  {
    label: 'listar avaliações de passivo',
    method: 'GET',
    url: () => '/batch-assessments',
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    // Leitura do lote é de todo papel (mesma régua de listar avaliações);
    // o demonstrativo por linha herda.
    label: 'demonstrativo de linha do passivo',
    method: 'GET',
    url: (c) => c.batchRowUrl,
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    label: 'criar caso',
    method: 'POST',
    url: () => '/cases',
    payload: { title: 'Caso da matriz' },
    allowed: ['owner', 'admin', 'lawyer'],
  },
  {
    label: 'honorário do caso',
    method: 'GET',
    url: (c) => `/cases/${c.ownerCaseId}/fee-agreement`,
    allowed: ['owner', 'admin', 'staff'],
  },
  {
    label: 'dashboard financeiro',
    method: 'GET',
    url: () => '/dashboard/finance',
    allowed: ['owner', 'admin', 'staff'],
  },
  {
    label: 'marca do escritório',
    method: 'PATCH',
    url: (c) => `/users/${c.actingUserId}`,
    payload: { officeName: 'Escritório da matriz' },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'criar cliente',
    method: 'POST',
    url: () => '/clients',
    payload: { name: 'Cliente da matriz' },
    allowed: ['owner', 'admin', 'lawyer', 'staff'],
  },
  {
    label: 'criar template',
    method: 'POST',
    url: () => '/document-templates',
    payload: { name: 'Modelo da matriz', type: 'customizado' },
    allowed: ['owner', 'admin', 'lawyer'],
  },
  {
    // O cálculo da fixture é do caso do owner: `lawyer` e `intern` não o
    // enxergam, então caem em 404 antes de qualquer regra de verbo. Que o
    // associado cria acordo no cálculo *dele* está no teste logo abaixo da
    // matriz.
    label: 'criar acordo em cálculo do owner',
    method: 'POST',
    url: (c) => `/labor-calculation/${c.ownerCalculationId}/settlements`,
    payload: { agreementRate: 0.8, feeType: 'percentage', feeValue: 30 },
    allowed: ['owner', 'admin'],
  },
  {
    // Mesma leitura do caso acima: o cálculo é do caso do owner, então
    // `lawyer` e `intern` levam 404 por invisibilidade antes da regra de verbo.
    // Reindexar move o valor de um cálculo fechado — fica com quem escreve.
    label: 'reindexar cálculo do owner',
    method: 'POST',
    url: (c) => `/labor-calculation/${c.ownerCalculationId}/reindex`,
    payload: { confirm: false },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'listar parcelas do acordo',
    method: 'GET',
    url: (c) => `/settlements/${c.settlementId}/installments`,
    allowed: ['owner', 'admin', 'staff'],
  },
  {
    label: 'listar organizações da pessoa',
    method: 'GET',
    url: () => '/organizations',
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    label: 'trocar a organização ativa',
    method: 'POST',
    url: () => '/auth/switch-organization',
    body: (c) => ({ organizationId: c.organizationId }),
    allowed: ['owner', 'admin', 'lawyer', 'staff', 'intern'],
  },
  {
    label: 'listar membros',
    method: 'GET',
    url: (c) => `/organizations/${c.organizationId}/members`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'mudar papel de membro',
    method: 'PATCH',
    url: (c) =>
      `/organizations/${c.organizationId}/members/${c.targetMembershipId}`,
    payload: { role: 'staff' },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'remover membro',
    method: 'DELETE',
    url: (c) =>
      `/organizations/${c.organizationId}/members/${c.targetMembershipId}`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'criar convite',
    method: 'POST',
    url: (c) => `/organizations/${c.organizationId}/invites`,
    payload: { email: 'convidado.matriz@example.com', role: 'lawyer' },
    allowed: ['owner', 'admin'],
  },
  {
    label: 'listar convites',
    method: 'GET',
    url: (c) => `/organizations/${c.organizationId}/invites`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'revogar convite',
    method: 'DELETE',
    url: (c) =>
      `/organizations/${c.organizationId}/invites/${c.pendingInviteId}`,
    allowed: ['owner', 'admin'],
  },
  {
    // A fixture não tem assinatura nem Stripe, então a resposta permitida é
    // 503. O que a linha afere é papel, e isso basta.
    label: 'preview de troca de plano',
    method: 'GET',
    url: (c) =>
      `/organizations/${c.organizationId}/plan/preview?code=banca&interval=monthly`,
    allowed: ['owner', 'admin'],
  },
  {
    label: 'trocar de plano',
    method: 'POST',
    url: (c) => `/organizations/${c.organizationId}/plan`,
    // Subida: descer para um plano que não comporta as seis pessoas da fixture
    // viria 409 por regra de teto, mascarando o que a linha mede.
    body: () => ({ code: 'max', interval: 'monthly' }),
    allowed: ['owner', 'admin'],
  },
  {
    label: 'transferir titularidade',
    method: 'POST',
    url: (c) => `/organizations/${c.organizationId}/transfer-ownership`,
    body: (c) => ({ userId: c.targetUserId }),
    allowed: ['owner'],
  },
]

/**
 * `DELETE /members/me` fica fora da matriz de propósito: todo papel pode sair,
 * e o titular recebe 409 — conflito de estado, não negativa de permissão. A
 * regra dele está em `organization/members.test.ts`.
 */

const ALL_ROLES: OrgRole[] = ['owner', 'admin', 'lawyer', 'staff', 'intern']

function calculationFields() {
  const money = '1000.00'

  return {
    clientName: 'Cliente',
    calculationVersion: 'v3',
    terminationType: 'sem_justa_causa' as const,
    startDate: new Date('2020-01-01'),
    endDate: new Date('2024-01-01'),
    lastSalary: money,
    baseSalary: money,
    unpaid13ths: 0,
    vacationCount: 0,
    priorNoticeWorked: false,
    extraHours: '0',
    nightHours: '0',
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: money,
    priorNoticeValue: money,
    thirteenthSalaryValue: money,
    vacationValue: money,
    fgtsValue: money,
    fgtsFineValue: money,
    unemploymentInsuranceValue: money,
    extraHoursValue: money,
    nightAdditionalValue: money,
    insalubrityValue: money,
    dangerousWorkValue: money,
    totalValue: money,
  }
}

/**
 * Tudo pendurado no `owner`: é o pior caso para `lawyer` e `intern`, que não
 * enxergam o que não é deles, e o caso interessante para `staff`, que enxerga
 * mas não escreve.
 */
async function fixture(role: OrgRole) {
  const roles = await createOrganizationWithRoles()

  const ownerCase = await systemPrisma.case.create({
    data: {
      title: 'Caso do owner',
      assignedToId: roles.owner.id,
      organizationId: roles.organization.id,
    },
    select: { id: true },
  })

  const calculation = await systemPrisma.laborCalculation.create({
    data: {
      userId: roles.owner.id,
      organizationId: roles.organization.id,
      caseId: ownerCase.id,
      ...calculationFields(),
    },
    select: { id: true },
  })

  const settlement = await systemPrisma.settlement.create({
    data: {
      organizationId: roles.organization.id,
      laborCalculationId: calculation.id,
      agreementRate: '80.00',
      feeType: 'percentage',
      feeValue: '30.00',
      agreementValue: '800.00',
      feeAmount: '240.00',
      netToClient: '560.00',
      estimatedTime: '6 meses',
    },
    select: { id: true },
  })

  // Sexto membro, criado só para ser alvo de mudança de papel, remoção e
  // transferência: com ele o alvo nunca coincide com o requisitante nem com o
  // titular, e as linhas da matriz medem papel em vez de tropeçar nas guardas
  // de "não em si mesmo" e "não no titular".
  const target = await createMember(roles.organization.id, 'intern')

  const invite = await systemPrisma.invite.create({
    data: {
      organizationId: roles.organization.id,
      email: 'convite.pendente@example.com',
      role: 'lawyer',
      tokenHash: hashInviteToken(`matriz-${role}-${target.user.id}`),
      invitedById: roles.owner.id,
      expiresAt: new Date(Date.now() + 60_000),
    },
    select: { id: true },
  })

  // Criado direto no banco, e não por HTTP: o limite por rota vale também em
  // ENV=test, e a fixture roda uma vez por linha da matriz — pelo HTTP o 11º
  // cálculo viria 429 e o token chegaria indefinido aqui.
  const publicToken = `matriz-public-${role}-${Date.now()}`
  const publicInput = {
    clientName: 'Consulta pública',
    startDate: '2020-01-10T00:00:00.000Z',
    endDate: '2024-06-20T00:00:00.000Z',
    lastSalary: 3000,
    baseSalary: 3000,
    lastThreeSalariesAvg: 3000,
    unpaid13ths: 0,
    vacationCount: 0,
    vacationVencidasCount: 0,
    priorNoticeWorked: false,
    extraHours: 0,
    nightHours: 0,
    insalubrityLevel: 0,
    dangerousWork: false,
    terminationType: 'sem_justa_causa',
    applyArt477Fine: true,
  }

  await systemPrisma.publicCalculation.create({
    data: {
      tokenHash: hashInviteToken(publicToken),
      input: publicInput,
      result: { floor: 0, ceiling: 0, lines: [], pending: [] },
      engineVersion: 'v3',
      source: 'matriz',
      expiresAt: new Date(Date.now() + 60_000),
    },
  })

  // O do widget é alcançado por id, não por token: o link do resultado ficou
  // com o visitante do site, e o escritório vê a linha na própria fila.
  const widgetCalculation = await systemPrisma.publicCalculation.create({
    data: {
      tokenHash: hashInviteToken(`matriz-widget-${role}-${Date.now()}`),
      input: publicInput,
      result: { floor: 0, ceiling: 0, lines: [], pending: [] },
      engineVersion: 'v3',
      source: 'widget',
      widgetOrganizationId: roles.organization.id,
      expiresAt: new Date(Date.now() + 60_000),
    },
    select: { id: true },
  })

  // Avaliação de passivo do owner com uma linha calculável: o demonstrativo
  // recomputa a partir do `input`, então ele precisa ser um BatchRowInput
  // válido. Sem snapshot — a rota cai no resolveIndexTable(), como um lote
  // criado antes de existirem snapshots.
  const batch = await systemPrisma.batchAssessment.create({
    data: {
      name: 'Passivo da matriz',
      userId: roles.owner.id,
      organizationId: roles.organization.id,
      engineVersion: 'v3',
    },
    select: { id: true },
  })

  const batchRow = await systemPrisma.batchAssessmentRow.create({
    data: {
      batchId: batch.id,
      order: 0,
      reference: '001',
      input: {
        reference: '001',
        terminationType: 'sem_justa_causa',
        startDate: '2020-01-10',
        endDate: '2024-06-20',
        lastSalary: 3000,
        registeredContract: true,
        priorNoticeWorked: false,
        unpaid13ths: 0,
        vacationVencidasCount: 0,
        extraHours: 'nao',
        nightWork: 'nao',
        insalubrity: 'nao',
        dangerousWork: 'nao',
      },
      severanceCost: '1000.00',
      exposure: '1500.00',
      gap: '500.00',
    },
    select: { id: true },
  })

  const ctx: Ctx = {
    organizationId: roles.organization.id,
    actingUserId: roles[role].id,
    ownerCaseId: ownerCase.id,
    ownerCalculationId: calculation.id,
    settlementId: settlement.id,
    targetMembershipId: target.membership.id,
    targetUserId: target.user.id,
    pendingInviteId: invite.id,
    publicCalculationToken: publicToken,
    widgetCalculationId: widgetCalculation.id,
    batchRowUrl: `/batch-assessments/${batch.id}/rows/${batchRow.id}`,
  }

  const token = app.jwt.sign({
    sub: roles[role].id,
    org: roles.organization.id,
  })

  return { ctx, token }
}

describe('matriz de permissões por papel', () => {
  for (const row of ROWS) {
    for (const role of ALL_ROLES) {
      const allowed = row.allowed.includes(role)

      it(`${allowed ? 'permite' : 'nega'} ${role} em "${row.label}"`, async () => {
        const { ctx, token } = await fixture(role)

        const res = await app.inject({
          method: row.method,
          url: row.url(ctx),
          headers: { authorization: `Bearer ${token}` },
          ...(row.body
            ? { payload: row.body(ctx) }
            : row.payload
              ? { payload: row.payload }
              : {}),
        })

        if (allowed) {
          expect(res.statusCode).toBeLessThan(400)
        } else {
          expect([403, 404]).toContain(res.statusCode)
        }
      })
    }
  }
})

describe('escrita dentro do próprio escopo', () => {
  it('lawyer cria acordo no cálculo do caso atribuído a ele', async () => {
    const roles = await createOrganizationWithRoles()

    const lawyerCase = await systemPrisma.case.create({
      data: {
        title: 'Caso do associado',
        assignedToId: roles.lawyer.id,
        organizationId: roles.organization.id,
      },
      select: { id: true },
    })

    const calculation = await systemPrisma.laborCalculation.create({
      data: {
        userId: roles.lawyer.id,
        organizationId: roles.organization.id,
        caseId: lawyerCase.id,
        ...calculationFields(),
      },
      select: { id: true },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/labor-calculation/${calculation.id}/settlements`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({
          sub: roles.lawyer.id,
          org: roles.organization.id,
        })}`,
      },
      payload: { agreementRate: 0.8, feeType: 'percentage', feeValue: 30 },
    })

    expect(res.statusCode).toBe(201)
  })

  it('intern recebe 403 ao criar acordo no cálculo do caso dele', async () => {
    const roles = await createOrganizationWithRoles()

    const internCase = await systemPrisma.case.create({
      data: {
        title: 'Caso do estagiário',
        assignedToId: roles.intern.id,
        organizationId: roles.organization.id,
      },
      select: { id: true },
    })

    const calculation = await systemPrisma.laborCalculation.create({
      data: {
        userId: roles.intern.id,
        organizationId: roles.organization.id,
        caseId: internCase.id,
        ...calculationFields(),
      },
      select: { id: true },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/labor-calculation/${calculation.id}/settlements`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({
          sub: roles.intern.id,
          org: roles.organization.id,
        })}`,
      },
      payload: { agreementRate: 0.8, feeType: 'percentage', feeValue: 30 },
    })

    expect(res.statusCode).toBe(403)
  })
})
