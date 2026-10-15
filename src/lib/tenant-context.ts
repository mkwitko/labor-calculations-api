import { AsyncLocalStorage } from 'node:async_hooks'
import { TenantContextMissingException } from '@/http/exceptions/tenant-context-missing-exception'

export type TenantStore = {
  organizationId: string | null
}

const storage = new AsyncLocalStorage<TenantStore>()

/**
 * Abre um store vazio para o request. Precisa ser chamado de um hook
 * `onRequest` em estilo callback: um `preHandler` async do Fastify não propaga
 * o contexto para o handler, porque o handler roda fora daquele escopo.
 */
export function runWithTenantStore<T>(fn: () => T): T {
  return storage.run({ organizationId: null }, fn)
}

/**
 * Entra direto num contexto com organização definida. Para cron, webhook e
 * qualquer trabalho fora de request que precise agir em nome de uma
 * organização específica.
 *
 * O `await fn()` aqui dentro não é estético: uma query do Prisma é uma
 * promise preguiçosa, que só dispara de verdade (e só aí a extension de
 * tenant lê a organização ativa) quando algo dá `.then()`/`await` nela. Se
 * `fn` apenas devolvesse a query sem esperar por ela, esse `.then()`
 * aconteceria de fora do `storage.run`, depois que o contexto já tivesse
 * saído de cena — falha fechada (exceção) se não houver contexto externo
 * nenhum, mas falha *aberta* (lê a organização externa errada, em silêncio)
 * se houver um `runAsOrganization` aninhado por fora. `await` aqui garante
 * que o disparo aconteça ainda dentro da janela certa.
 */
export async function runAsOrganization<T>(
  organizationId: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  return storage.run({ organizationId }, async () => await fn())
}

export function currentTenantStore(): TenantStore | undefined {
  return storage.getStore()
}

export function currentOrganizationId(): string | null {
  return storage.getStore()?.organizationId ?? null
}

/**
 * Define a organização do request depois que a membership foi validada. O
 * store já existe (criado no `onRequest`); aqui só se muta o campo.
 */
export function setActiveOrganization(organizationId: string): void {
  const store = storage.getStore()

  if (!store) {
    throw new Error('setActiveOrganization chamado fora de um store de tenant')
  }

  store.organizationId = organizationId
}

/**
 * A organização ativa, ou exceção. É o que os `create` de modelo tenant
 * declaram no `data`.
 *
 * O Prisma exige `organizationId` no tipo gerado — a opcionalidade de um campo
 * de input vem de `isRequired` no DMMF, fixado quando o schema compila, e
 * nenhuma extension relaxa isso. Então o campo aparece no call site. A
 * extension continua sobrescrevendo com esta mesma organização, o que torna o
 * valor daqui redundante de propósito: errar não vaza, esquecer não compila.
 */
export function requireOrganizationId(): string {
  const organizationId = currentOrganizationId()

  if (!organizationId) {
    throw new TenantContextMissingException('modelo tenant', 'create')
  }

  return organizationId
}
