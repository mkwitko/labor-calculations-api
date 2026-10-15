import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { assertRole, requireRole } from './require-role'

function actor(role: 'owner' | 'admin' | 'lawyer' | 'staff' | 'intern') {
  return { userId: 'user-1', organizationId: 'org-1', role }
}

function fakeRequest(tenant: ReturnType<typeof actor> | undefined) {
  return { tenant } as unknown as FastifyRequest
}

const reply = {} as FastifyReply

/**
 * Asserção por `statusCode`, não por `instanceof`: neste setup de Vitest a
 * classe de exceção importada pelo teste e a importada pelo módulo sob teste
 * são instâncias de módulo diferentes (`test.alias` e `vite-tsconfig-paths`
 * resolvem `@/` em paralelo), então `toThrow(ForbiddenException)` falha mesmo
 * com a exceção certa. O status é o contrato que importa.
 */
function statusOf(fn: () => unknown): number | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}

async function asyncStatusOf(fn: () => Promise<unknown>) {
  try {
    await fn()
    return undefined
  } catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}

describe('assertRole', () => {
  it('passa quando o papel está na lista', () => {
    expect(() => assertRole(actor('admin'), 'owner', 'admin')).not.toThrow()
  })

  it('recusa com 403 quando o papel está fora da lista', () => {
    expect(statusOf(() => assertRole(actor('lawyer'), 'owner', 'admin'))).toBe(
      403,
    )
  })

  it('nomeia os papéis exigidos na mensagem', () => {
    expect(() => assertRole(actor('intern'), 'owner')).toThrow(/owner/)
  })
})

describe('requireRole', () => {
  it('passa o request adiante quando o papel basta', async () => {
    await expect(
      requireRole('owner', 'admin')(fakeRequest(actor('owner')), reply),
    ).resolves.toBeUndefined()
  })

  it('recusa com 403 quando o papel não basta', async () => {
    expect(
      await asyncStatusOf(() =>
        requireRole('owner')(fakeRequest(actor('staff')), reply),
      ),
    ).toBe(403)
  })

  it('recusa com 401 quando não há tenant no request', async () => {
    expect(
      await asyncStatusOf(() =>
        requireRole('owner')(fakeRequest(undefined), reply),
      ),
    ).toBe(401)
  })
})
