import { randomBytes } from 'node:crypto'
import type { Organization } from '@prisma/client'
import type { PrismaTransactionClient } from 'prisma/prisma'
import { currentOrganizationId } from '@/lib/tenant-context'
import { MS_PER_DAY } from '@/utils/constants'
import { cloneSystemTemplates } from './clone-system-templates'

const TRIAL_DAYS = 7

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

type Input = {
  userId: string
  name: string
  officeName: string | null
  phone: string | null
}

/**
 * Cria a organização inicial de um usuário e o torna owner.
 *
 * Todo usuário tem organização desde o primeiro segundo: sem isso existiriam
 * dois caminhos de autorização, com e sem tenant, e é dessa bifurcação que
 * saem os vazamentos.
 *
 * `phone` mora na organização desde que `User.phone` saiu do schema (Tarefa
 * 2): para o profissional autônomo o telefone do escritório e o telefone da
 * pessoa são o mesmo número, então guardá-lo aqui não perde nada hoje.
 *
 * Nunca chamar de dentro de um contexto de organização ativo: a extension de
 * tenant sobrescreveria o `organizationId` dos templates clonados com a
 * organização ativa, em vez da recém-criada — corromperia o tenant dessas
 * linhas em silêncio. Rode sempre fora do contexto, com `systemPrisma`.
 */
export async function createPersonalOrganization(
  tx: PrismaTransactionClient,
  { userId, name, officeName, phone }: Input,
): Promise<Organization> {
  if (currentOrganizationId() !== null) {
    throw new Error(
      'createPersonalOrganization não pode rodar dentro de um contexto de ' +
        'organização: a extension de tenant sobrescreveria o organizationId ' +
        'dos templates clonados com a organização ativa. Rode fora do contexto, ' +
        'com systemPrisma.',
    )
  }

  const label = officeName?.trim() || `Carteira de ${name}`
  const slug = `${slugify(label) || 'escritorio'}-${randomBytes(4).toString('hex')}`

  const organization = await tx.organization.create({
    data: {
      name: label,
      slug,
      seats: 1,
      phone,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * MS_PER_DAY),
      memberships: { create: { userId, role: 'owner' } },
    },
  })

  await cloneSystemTemplates(tx, organization.id)

  return organization
}
