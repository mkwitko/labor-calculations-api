import { verify } from 'argon2'
import { systemPrisma } from 'prisma/prisma'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * Teto de cadastros com o mesmo e-mail que entram na verificação. Cada um custa
 * um argon2, que é caro de propósito; cinco é mais escritórios do que uma pessoa
 * real acumula e mantém o pior caso do login em fração de segundo.
 */
const MAX_CANDIDATES = 5

export type AuthenticateClientResult =
  | {
      status: 'signed_in'
      clientId: string
      mustChangePassword: boolean
      /** Outras contas do mesmo e-mail cuja senha bateu neste login. */
      linkedClientIds: string[]
    }
  | {
      status: 'choose_organization'
      organizations: Array<{ id: string; name: string }>
    }

/**
 * Login do portal por e-mail e senha, sem a OAB do advogado.
 *
 * A OAB identificava o escritório antes de qualquer verificação, o que exigia
 * que o cliente soubesse o número — quem chega por importação de cálculo
 * público não sabe. Aqui o escritório é descoberto **depois** da senha bater:
 * a lista de organizações só sai quando a mesma senha vale em mais de um
 * cadastro, senão o endpoint viraria consulta de "em quais escritórios fulano
 * é cliente".
 *
 * O login também devolve as contas irmãs (`linkedClientIds`): os outros
 * cadastros do mesmo e-mail cuja senha bateu agora. É o que permite trocar de
 * escritório dentro do portal sem digitar senha de novo — conta com senha
 * diferente fica de fora e só entra pelo login.
 *
 * `Client` é modelo tenant e não há contexto de organização antes do login, daí
 * o `systemPrisma` em tudo aqui.
 */
export async function authenticateClient(params: {
  mail: string
  password: string
  organizationId?: string
}): Promise<AuthenticateClientResult> {
  const candidates = await systemPrisma.client.findMany({
    where: {
      mail: params.mail,
      deletedAt: null,
      password: { not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_CANDIDATES,
    select: {
      id: true,
      organizationId: true,
      password: true,
      mustChangePassword: true,
      loginAttempts: true,
      lockedUntil: true,
    },
  })

  if (candidates.length === 0) {
    throw new BadRequestException('Credenciais inválidas')
  }

  const now = Date.now()
  const unlocked = candidates.filter(
    (candidate) =>
      !candidate.lockedUntil || candidate.lockedUntil.getTime() <= now,
  )

  if (unlocked.length === 0) {
    const earliestUnlock = Math.min(
      ...candidates.map((candidate) => candidate.lockedUntil?.getTime() ?? now),
    )
    const minutesLeft = Math.ceil((earliestUnlock - now) / 60000)

    throw new UnauthorizedException(
      `Conta bloqueada. Tente novamente em ${minutesLeft} minutos.`,
    )
  }

  const matches: typeof unlocked = []

  for (const candidate of unlocked) {
    if (
      candidate.password &&
      (await verify(candidate.password, params.password))
    ) {
      matches.push(candidate)
    }
  }

  if (matches.length === 0) {
    await registerFailure(unlocked)
  }

  // Segunda ida do login: o `organizationId` do corpo escolhe o principal
  // entre os matches, e não estreita a busca — é assim que o cookie desta
  // sessão passa a lembrar dos irmãos.
  if (params.organizationId) {
    const principal = matches.find(
      (match) => match.organizationId === params.organizationId,
    )

    // Senha certa, mas não naquele escritório: mesma recusa de senha errada,
    // senão a resposta diria em quais escritórios o e-mail tem conta.
    if (!principal) {
      throw new BadRequestException('Credenciais inválidas')
    }

    return completeSignIn(
      principal,
      matches.filter((match) => match.id !== principal.id),
    )
  }

  if (matches.length > 1) {
    const organizations = await systemPrisma.organization.findMany({
      where: { id: { in: matches.map((match) => match.organizationId) } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })

    return { status: 'choose_organization', organizations }
  }

  return completeSignIn(matches[0], [])
}

async function completeSignIn(
  client: { id: string; mustChangePassword: boolean },
  linked: Array<{ id: string }>,
): Promise<AuthenticateClientResult> {
  await systemPrisma.client.update({
    where: { id: client.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  })

  return {
    status: 'signed_in',
    clientId: client.id,
    mustChangePassword: client.mustChangePassword,
    linkedClientIds: linked.map((sibling) => sibling.id),
  }
}

/**
 * A tentativa errada conta para todos os cadastros exercitados, não só para um:
 * quem chuta a senha de um e-mail chuta contra todos ao mesmo tempo, e contar
 * num só deixaria o bloqueio cinco vezes mais lento com cinco escritórios.
 */
async function registerFailure(
  candidates: Array<{ id: string; loginAttempts: number }>,
): Promise<never> {
  await systemPrisma.client.updateMany({
    where: { id: { in: candidates.map((candidate) => candidate.id) } },
    data: { loginAttempts: { increment: 1 } },
  })

  const nowLocked = candidates.filter(
    (candidate) => candidate.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS,
  )

  if (nowLocked.length > 0) {
    await systemPrisma.client.updateMany({
      where: { id: { in: nowLocked.map((candidate) => candidate.id) } },
      data: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
    })

    throw new UnauthorizedException(
      'Muitas tentativas de login. Conta bloqueada por 15 minutos.',
    )
  }

  throw new BadRequestException('Credenciais inválidas')
}
