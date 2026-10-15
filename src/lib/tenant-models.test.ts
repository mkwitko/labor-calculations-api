import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  isTenantModel,
  NON_TENANT_MODELS,
  TENANT_MODELS,
} from './tenant-models'

const schemaModels = Prisma.dmmf.datamodel.models

describe('classificação de modelos tenant', () => {
  it('classifica todo modelo do schema como tenant ou não-tenant', () => {
    const unclassified = schemaModels
      .map((m) => m.name)
      .filter(
        (name) => !TENANT_MODELS.has(name) && !NON_TENANT_MODELS.has(name),
      )

    expect(unclassified).toEqual([])
  })

  it('não classifica o mesmo modelo nos dois grupos', () => {
    const both = [...TENANT_MODELS].filter((name) =>
      NON_TENANT_MODELS.has(name),
    )

    expect(both).toEqual([])
  })

  it('não lista modelo que não existe no schema', () => {
    const names = new Set(schemaModels.map((m) => m.name))
    const ghosts = [...TENANT_MODELS, ...NON_TENANT_MODELS].filter(
      (name) => !names.has(name),
    )

    expect(ghosts).toEqual([])
  })

  it('exige organizationId em todo modelo tenant', () => {
    const missing = schemaModels
      .filter((m) => TENANT_MODELS.has(m.name))
      .filter((m) => !m.fields.some((f) => f.name === 'organizationId'))
      .map((m) => m.name)

    expect(missing).toEqual([])
  })

  it('exige que organizationId seja obrigatório nos modelos tenant', () => {
    const nullable = schemaModels
      .filter((m) => TENANT_MODELS.has(m.name))
      .flatMap((m) => m.fields.filter((f) => f.name === 'organizationId'))
      .filter((f) => !f.isRequired)

    expect(nullable).toEqual([])
  })

  it('isTenantModel devolve false sem modelo', () => {
    expect(isTenantModel(undefined)).toBe(false)
    expect(isTenantModel('User')).toBe(false)
    expect(isTenantModel('Case')).toBe(true)
  })
})
