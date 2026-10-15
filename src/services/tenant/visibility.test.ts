import type { OrgRole } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  calculationVisibility,
  canAccessFinance,
  canManageMembers,
  canWriteCases,
  caseRelationVisibility,
  caseVisibility,
  seesAllCases,
} from './visibility'

function actor(role: OrgRole) {
  return { userId: 'user-1', organizationId: 'org-1', role }
}

const ALL_ROLES: OrgRole[] = ['owner', 'admin', 'lawyer', 'staff', 'intern']

describe('capacidades por papel', () => {
  it('owner, admin e staff enxergam todo caso da organização', () => {
    expect(ALL_ROLES.filter(seesAllCases)).toEqual(['owner', 'admin', 'staff'])
  })

  it('owner, admin e lawyer escrevem em caso', () => {
    expect(ALL_ROLES.filter(canWriteCases)).toEqual([
      'owner',
      'admin',
      'lawyer',
    ])
  })

  it('owner, admin e staff acessam o financeiro', () => {
    expect(ALL_ROLES.filter(canAccessFinance)).toEqual([
      'owner',
      'admin',
      'staff',
    ])
  })

  it('owner e admin administram membros', () => {
    expect(ALL_ROLES.filter(canManageMembers)).toEqual(['owner', 'admin'])
  })
})

describe('caseVisibility', () => {
  it('não filtra nada para quem enxerga tudo', () => {
    for (const role of ['owner', 'admin', 'staff'] as OrgRole[]) {
      expect(caseVisibility(actor(role))).toEqual({})
    }
  })

  it('filtra por atribuição para lawyer e intern', () => {
    for (const role of ['lawyer', 'intern'] as OrgRole[]) {
      expect(caseVisibility(actor(role))).toEqual({ assignedToId: 'user-1' })
    }
  })
})

describe('caseRelationVisibility', () => {
  it('acrescenta deletedAt null ao fragmento', () => {
    expect(caseRelationVisibility(actor('owner'))).toEqual({ deletedAt: null })
    expect(caseRelationVisibility(actor('lawyer'))).toEqual({
      assignedToId: 'user-1',
      deletedAt: null,
    })
  })
})

describe('calculationVisibility', () => {
  it('não filtra nada para quem enxerga tudo', () => {
    expect(calculationVisibility(actor('admin'))).toEqual({})
  })

  it('para lawyer, aceita cálculo de caso atribuído ou cálculo solto próprio', () => {
    expect(calculationVisibility(actor('lawyer'))).toEqual({
      OR: [
        { case: { assignedToId: 'user-1' } },
        { caseId: null, userId: 'user-1' },
      ],
    })
  })
})
