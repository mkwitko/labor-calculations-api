import { systemPrisma } from 'prisma/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAsOrganization } from '@/lib/tenant-context'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import { resolveContext } from './generate-document-service'

/**
 * `resolveContext` passou a receber o ator do request (pessoa + organização +
 * papel) em vez do id da pessoa. Nestes testes o papel não muda o que se
 * espera, então `owner` serve como padrão.
 */
function actor(
  userId: string,
  organizationId: string,
  role: 'owner' | 'admin' | 'lawyer' | 'staff' | 'intern' = 'owner',
) {
  return { userId, organizationId, role }
}

function fmt(value: number | string | null | undefined): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return String(value)
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleDateString('pt-BR')
}

describe('fmt (currency formatter)', () => {
  it('formats numbers as pt-BR currency with 2 decimals', () => {
    expect(fmt(1234.56)).toBe('1.234,56')
    expect(fmt(0)).toBe('0,00')
    expect(fmt(999999.99)).toBe('999.999,99')
  })

  it('formats string numbers', () => {
    expect(fmt('1500')).toBe('1.500,00')
    expect(fmt('99.90')).toBe('99,90')
  })

  it('returns — for null/undefined', () => {
    expect(fmt(null)).toBe('—')
    expect(fmt(undefined)).toBe('—')
  })

  it('returns string value for NaN', () => {
    expect(fmt('not-a-number')).toBe('not-a-number')
  })
})

describe('fmtDate (date formatter)', () => {
  it('formats Date objects as pt-BR date', () => {
    const d = new Date(2024, 5, 15)
    const result = fmtDate(d)
    expect(result).toContain('2024')
    expect(result).toContain('06')
  })

  it('returns — for null/undefined', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
  })
})

// Cobertura de banco de verdade para `resolveContext`: os dois testes acima
// são unitários puros e nunca chamam o banco, então uma quebra em
// `LAWYER_SELECT` (colunas que saíram de `User` e foram para `Organization`)
// passava despercebida — só falhava em produção. Estes testes existem para
// que essa classe de regressão quebre um teste, não só o runtime.
describe('resolveContext (integração)', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('lê identidade pessoal de User e marca da Organization', async () => {
    const { user, organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: {
        name: 'Pereira Advocacia',
        phone: '48999990000',
        brandPrimaryColor: '#7e14ff',
      },
    })

    const { context } = await runAsOrganization(organization.id, () =>
      resolveContext(actor(user.id, organization.id), {}),
    )

    expect(context.lawyer).toMatchObject({
      name: user.name,
      mail: user.mail,
      oabNumber: user.oabNumber,
      officeName: 'Pereira Advocacia',
      phone: '48999990000',
      brandPrimaryColor: '#7e14ff',
    })
  })

  // Regressão real, achada em revisão: `resolveContext` chamava
  // `brandingForUser(userId)`, que só resolve organização em que a pessoa é
  // `owner` (via `findOwnedOrganization`). Num escritório com vários
  // assentos — o motivo deste projeto existir — a maioria das pessoas é
  // `lawyer`/`admin`, não `owner`. Este teste usa `createTestUser()` só
  // para o dono do escritório; o associado é criado à parte, sem
  // organização própria, e só ganha uma `Membership` de `lawyer` na
  // organização existente — exatamente o caso que `brandingForUser`
  // devolvia `null` para, e que passava despercebido porque os outros
  // testes deste arquivo usam `createTestUser()` para todo mundo, que
  // sempre torna a pessoa owner da própria organização.
  it('resolve a marca da organização mesmo para um membro que não é owner (lawyer/admin)', async () => {
    const { organization } = await createTestUser()
    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: {
        name: 'Multi-assento Advocacia',
        logoUrl: 'https://cdn/logo-multi.png',
      },
    })

    const associate = await systemPrisma.user.create({
      data: {
        name: 'Advogado Associado',
        mail: `associado_${Date.now()}@test.com`,
        document: `${Date.now()}associado`,
        oabNumber: `SP/${Date.now()}associado`,
        password: 'x',
      },
    })
    await systemPrisma.membership.create({
      data: {
        userId: associate.id,
        organizationId: organization.id,
        role: 'lawyer',
      },
    })

    const { context } = await runAsOrganization(organization.id, () =>
      resolveContext(actor(associate.id, organization.id, 'lawyer'), {}),
    )

    expect(context.lawyer).toMatchObject({
      officeName: 'Multi-assento Advocacia',
      logoUrl: 'https://cdn/logo-multi.png',
    })
  })

  it('resolve o cliente vinculado dentro do contexto da organização', async () => {
    const { user, organization } = await createTestUser()
    const client = await systemPrisma.client.create({
      data: {
        userId: user.id,
        name: 'Maria Silva',
        organizationId: organization.id,
      },
    })

    const { context, primaryName } = await runAsOrganization(
      organization.id,
      () =>
        resolveContext(actor(user.id, organization.id), {
          clientId: client.id,
        }),
    )

    expect(context.client?.id).toBe(client.id)
    expect(primaryName).toBe('Maria Silva')
  })

  it('devolve lawyer null quando o usuário não existe', async () => {
    const { organization } = await createTestUser()

    const { context } = await runAsOrganization(organization.id, () =>
      resolveContext(actor('user_nao_existe', organization.id), {}),
    )

    expect(context.lawyer).toBeNull()
  })
})
