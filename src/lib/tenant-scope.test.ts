import { describe, expect, it } from 'vitest'
import { withOrganizationScope } from './tenant-scope'

const ORG = 'org_1'

describe('withOrganizationScope', () => {
  it('injeta no where de findMany', () => {
    expect(
      withOrganizationScope({ where: { deletedAt: null } }, 'findMany', ORG),
    ).toEqual({ where: { deletedAt: null, organizationId: ORG } })
  })

  it('cria o where quando não há um', () => {
    expect(withOrganizationScope({}, 'findMany', ORG)).toEqual({
      where: { organizationId: ORG },
    })
  })

  it('injeta no where de findUnique sem quebrar o id', () => {
    expect(
      withOrganizationScope({ where: { id: 'c1' } }, 'findUnique', ORG),
    ).toEqual({ where: { id: 'c1', organizationId: ORG } })
  })

  it('injeta no data de create', () => {
    expect(
      withOrganizationScope({ data: { title: 'x' } }, 'create', ORG),
    ).toEqual({ data: { title: 'x', organizationId: ORG } })
  })

  it('injeta em cada item de createMany', () => {
    expect(
      withOrganizationScope(
        { data: [{ title: 'a' }, { title: 'b' }] },
        'createMany',
        ORG,
      ),
    ).toEqual({
      data: [
        { title: 'a', organizationId: ORG },
        { title: 'b', organizationId: ORG },
      ],
    })
  })

  it('injeta nos dois lados de upsert, menos no update', () => {
    expect(
      withOrganizationScope(
        { where: { id: 'c1' }, create: { title: 'x' }, update: { title: 'y' } },
        'upsert',
        ORG,
      ),
    ).toEqual({
      where: { id: 'c1', organizationId: ORG },
      create: { title: 'x', organizationId: ORG },
      update: { title: 'y' },
    })
  })

  it('injeta no where de count, aggregate e groupBy', () => {
    for (const op of ['count', 'aggregate', 'groupBy'] as const) {
      expect(withOrganizationScope({}, op, ORG)).toEqual({
        where: { organizationId: ORG },
      })
    }
  })

  it('sobrescreve organizationId vindo do chamador', () => {
    expect(
      withOrganizationScope(
        { where: { organizationId: 'org_alheia' } },
        'findMany',
        ORG,
      ),
    ).toEqual({ where: { organizationId: ORG } })
  })

  it('sobrescreve organizationId vindo do chamador em create', () => {
    expect(
      withOrganizationScope(
        { data: { title: 'x', organizationId: 'org_alheia' } },
        'create',
        ORG,
      ),
    ).toEqual({ data: { title: 'x', organizationId: ORG } })
  })

  it('não muta o objeto recebido', () => {
    const args = { where: { deletedAt: null } }
    withOrganizationScope(args, 'findMany', ORG)

    expect(args).toEqual({ where: { deletedAt: null } })
  })

  it('lança em operação raw', () => {
    expect(() => withOrganizationScope({}, '$queryRaw', ORG)).toThrow(/raw/i)
  })
})
