const RAW_OPERATIONS = new Set([
  '$queryRaw',
  '$executeRaw',
  '$queryRawUnsafe',
  '$executeRawUnsafe',
])

type AnyArgs = Record<string, unknown>

function scopedWhere(where: unknown, organizationId: string): AnyArgs {
  return { ...(where as AnyArgs | undefined), organizationId }
}

function scopedData(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => ({ ...(item as AnyArgs), organizationId }))
  }

  return { ...(data as AnyArgs | undefined), organizationId }
}

/**
 * Devolve uma cópia de `args` com `organizationId` fixado na organização
 * ativa. O valor da organização ativa sempre vence o que veio do chamador —
 * um `where` com outra organização é sobrescrito, não respeitado.
 *
 * `findUnique`, `update` e `delete` recebem `organizationId` junto do id no
 * `where`, o que o Prisma aceita desde a versão 5 (extendedWhereUnique).
 *
 * `update` e `updateMany` só têm o `where` filtrado: mover uma linha para
 * outra organização não é operação que a extension deva permitir por acidente.
 */
export function withOrganizationScope(
  args: unknown,
  operation: string,
  organizationId: string,
): unknown {
  if (RAW_OPERATIONS.has(operation)) {
    throw new Error(
      `Operação raw "${operation}" não é permitida sob contexto de tenant: ` +
        'não há where onde injetar o filtro de organização. Use systemPrisma.',
    )
  }

  const input = { ...((args ?? {}) as AnyArgs) }

  switch (operation) {
    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
      return { ...input, data: scopedData(input.data, organizationId) }

    case 'upsert':
      return {
        ...input,
        where: scopedWhere(input.where, organizationId),
        create: scopedData(input.create, organizationId),
      }

    default:
      return { ...input, where: scopedWhere(input.where, organizationId) }
  }
}
