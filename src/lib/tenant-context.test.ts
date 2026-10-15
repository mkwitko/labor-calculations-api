import { describe, expect, it } from 'vitest'
import { TenantContextMissingException } from '@/http/exceptions/tenant-context-missing-exception'
import {
  currentOrganizationId,
  requireOrganizationId,
  runAsOrganization,
  runWithTenantStore,
  setActiveOrganization,
} from './tenant-context'

describe('tenant context', () => {
  it('não tem organização fora de um store', () => {
    expect(currentOrganizationId()).toBeNull()
  })

  it('enxerga a organização definida depois da criação do store', () => {
    runWithTenantStore(() => {
      expect(currentOrganizationId()).toBeNull()
      setActiveOrganization('org_1')
      expect(currentOrganizationId()).toBe('org_1')
    })
  })

  it('mantém a organização através de await', async () => {
    await runWithTenantStore(async () => {
      setActiveOrganization('org_2')
      await Promise.resolve()
      expect(currentOrganizationId()).toBe('org_2')
    })
  })

  it('isola stores concorrentes', async () => {
    const a = runWithTenantStore(async () => {
      setActiveOrganization('org_a')
      await new Promise((r) => setTimeout(r, 10))
      return currentOrganizationId()
    })

    const b = runWithTenantStore(async () => {
      setActiveOrganization('org_b')
      return currentOrganizationId()
    })

    expect(await Promise.all([a, b])).toEqual(['org_a', 'org_b'])
  })

  it('runAsOrganization já entra com a organização definida', async () => {
    const seen = await runAsOrganization('org_3', async () =>
      currentOrganizationId(),
    )

    expect(seen).toBe('org_3')
  })

  // Simula uma query preguiçosa do Prisma: só lê a organização ativa quando
  // algo dá `.then()` nela, não no instante em que a função foi chamada.
  function lazyOrganizationRead(): PromiseLike<string | null> {
    return {
      // biome-ignore lint/suspicious/noThenProperty: thenable de propósito
      then: (resolve?: ((value: string | null) => void) | null) => {
        queueMicrotask(() => resolve?.(currentOrganizationId()))
      },
    } as PromiseLike<string | null>
  }

  it('mantém o contexto mesmo com callback não-async que devolve algo preguiçoso', async () => {
    const seen = await runAsOrganization('org_5', () => lazyOrganizationRead())

    expect(seen).toBe('org_5')
  })

  it('runAsOrganization aninhado não vaza para a organização externa', async () => {
    const seen = await runAsOrganization('org_outer', async () =>
      runAsOrganization('org_inner', () => lazyOrganizationRead()),
    )

    expect(seen).toBe('org_inner')
  })

  it('setActiveOrganization fora de um store lança', () => {
    expect(() => setActiveOrganization('org_4')).toThrow(
      /fora de um store de tenant/,
    )
  })
})

describe('requireOrganizationId', () => {
  it('devolve a organização ativa', async () => {
    await runAsOrganization('org_1', () => {
      expect(requireOrganizationId()).toBe('org_1')
    })
  })

  it('lança quando não há store nenhum', () => {
    expect(() => requireOrganizationId()).toThrow(TenantContextMissingException)
  })

  it('lança dentro de store sem organização definida', () => {
    runWithTenantStore(() => {
      expect(() => requireOrganizationId()).toThrow(
        TenantContextMissingException,
      )
    })
  })
})
