import type { OrgRole } from '@prisma/client'
import { hash } from 'argon2'
import { systemPrisma as prisma } from 'prisma/prisma'
import { createPersonalOrganization } from '@/services/tenant/create-organization'

/**
 * Recusa qualquer escrita destrutiva se o banco apontado não for claramente de
 * teste.
 *
 * `pnpm test` injeta o `.env.test`; rodar `vitest` direto NÃO injeta, e o
 * `.env` de desenvolvimento assume — foi assim que um `deleteMany` de teste
 * chegou ao banco de desenvolvimento em 2026-08-06. Um TRUNCATE CASCADE no
 * banco errado é irreversível sem restore, então a checagem vem antes.
 */
export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`DATABASE_URL ausente ou inválida: ${url || '(vazia)'}`)
  }

  const host = parsed.hostname
  const database = parsed.pathname.replace(/^\//, '')
  const isLocalHost =
    host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const isTestDatabase = /_test$/.test(database)

  if (!isLocalHost || !isTestDatabase) {
    throw new Error(
      `Recusando escrita destrutiva: DATABASE_URL aponta para ${host}/${database}, ` +
        'que não é um banco de teste local (esperado: localhost + nome terminando em "_test"). ' +
        'Rode `pnpm test`, que injeta o .env.test — `vitest` direto usa o .env de desenvolvimento.',
    )
  }
}

// Wipes every table (except the migrations bookkeeping) with a single
// TRUNCATE ... CASCADE, so tests don't have to delete in foreign-key order.
// Safe only against the local test DB configured in .env.test.
export async function cleanDatabase() {
  assertTestDatabase()
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `
  if (rows.length === 0) return
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`)
}

interface CreateUserOptions {
  name?: string
  mail?: string
  document?: string
  oabNumber?: string
  password?: string
}

export async function createTestUser(opts: CreateUserOptions = {}) {
  const plainPassword = opts.password ?? 'password123'
  const hashedPassword = await hash(plainPassword, {
    memoryCost: 1024,
    timeCost: 1,
    parallelism: 1,
  })
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? 'Test User',
      mail:
        opts.mail ??
        `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      document:
        opts.document ?? `${Date.now()}${Math.random().toString(36).slice(2)}`,
      oabNumber: opts.oabNumber ?? `SP/${Date.now()}`,
      password: hashedPassword,
    },
  })

  const organization = await createPersonalOrganization(prisma, {
    userId: user.id,
    name: user.name,
    officeName: null,
    phone: null,
  })

  return { user, organization, plainPassword }
}

type MemberOptions = {
  name?: string
  mail?: string
  document?: string
  oabNumber?: string
}

let memberCounter = 0

/**
 * Cria uma pessoa com **uma só** membership, na organização informada.
 *
 * Deliberadamente não usa `createTestUser`: aquele helper cria a organização
 * pessoal do usuário, que seria a membership mais antiga dele — e
 * `resolveActiveMembership` cai na mais antiga quando o token não traz `org`.
 * Um membro de teste com organização pessoal agiria na organização errada.
 */
export async function createMember(
  organizationId: string,
  role: OrgRole,
  opts: MemberOptions = {},
) {
  memberCounter += 1
  const suffix = `${memberCounter}_${Math.random().toString(36).slice(2, 8)}`
  const hashedPassword = await hash('password123', {
    memoryCost: 1024,
    timeCost: 1,
    parallelism: 1,
  })

  const user = await prisma.user.create({
    data: {
      name: opts.name ?? `${role} ${suffix}`,
      mail: opts.mail ?? `${role}_${suffix}@example.com`,
      document: opts.document ?? `doc_${suffix}`,
      oabNumber: opts.oabNumber ?? `SP/${suffix}`,
      password: hashedPassword,
    },
  })

  const membership = await prisma.membership.create({
    data: { userId: user.id, organizationId, role },
  })

  return { user, membership }
}

/**
 * Uma organização com os cinco papéis ocupados — a fixture dos testes de
 * matriz de permissão. O `owner` é o dono da organização criada por
 * `createTestUser`; os outros quatro entram como membros.
 */
export async function createOrganizationWithRoles() {
  const { user: owner, organization } = await createTestUser()

  // Cinco pessoas não cabem no plano default (Solo, uma pessoa): sem isto todo
  // teste de convite feito sobre esta fixture receberia 409 de teto, que é
  // conflito de cobrança e não o que essas suítes aferem.
  await prisma.organization.update({
    where: { id: organization.id },
    data: { planCode: 'escritorio' },
  })

  const { user: admin } = await createMember(organization.id, 'admin')
  const { user: lawyer } = await createMember(organization.id, 'lawyer')
  const { user: staff } = await createMember(organization.id, 'staff')
  const { user: intern } = await createMember(organization.id, 'intern')

  return { organization, owner, admin, lawyer, staff, intern }
}

type CalculationOptions = {
  clientId?: string
  caseId?: string
  clientName?: string
}

/**
 * Um `LaborCalculation` mínimo que o Prisma aceite. O modelo exige 22 escalares
 * sem default — inclusive os campos de resultado, porque o registro guarda
 * entrada e saída juntas. Para quem só precisa que exista um cálculo, repetir
 * essa lista no teste é ruído; os valores são neutros de propósito e não
 * representam liquidação real.
 */
export async function createTestCalculation(
  userId: string,
  organizationId: string,
  opts: CalculationOptions = {},
) {
  return prisma.laborCalculation.create({
    data: {
      userId,
      organizationId,
      clientId: opts.clientId,
      caseId: opts.caseId,
      clientName: opts.clientName ?? 'Cliente de Teste',
      calculationVersion: 'v3',
      terminationType: 'sem_justa_causa',
      startDate: new Date('2020-01-01'),
      endDate: new Date('2024-01-01'),
      lastSalary: 3000,
      baseSalary: 3000,
      lastThreeSalariesAvg: 3000,
      unpaid13ths: 0,
      vacationCount: 0,
      priorNoticeWorked: false,
      extraHours: 0,
      nightHours: 0,
      insalubrityLevel: 0,
      dangerousWork: false,
      priorNoticeValue: 0,
      thirteenthSalaryValue: 0,
      vacationValue: 0,
      fgtsValue: 0,
      fgtsFineValue: 0,
      unemploymentInsuranceValue: 0,
      extraHoursValue: 0,
      nightAdditionalValue: 0,
      insalubrityValue: 0,
      dangerousWorkValue: 0,
      totalValue: 0,
    },
  })
}
