import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TENANT_MODELS } from './tenant-models'

/**
 * Todo controller que consulta um modelo tenant precisa rodar atrás de um
 * hook que preencha o contexto de organização (`auth`, `clientAuth`,
 * `optionalClientAuth`, `requireAdmin`) — ou, se a rota é legitimamente
 * pública (token de reset, link de compartilhamento), precisa resolver a
 * organização na mão com `systemPrisma` + `runAsOrganization` antes de
 * tocar o client com escopo. Sem isso, a rota estoura
 * `TenantContextMissingException` em produção assim que alguém a chama —
 * exatamente o que aconteceu com sign-in/forgot-password/reset-password do
 * portal e com o link de cálculo compartilhado, e que nenhuma suíte
 * pegou porque essas rotas não tinham teste nenhum.
 *
 * Este teste varre o código-fonte (não o comportamento em runtime) para não
 * depender de banco, e falha citando o arquivo assim que uma rota nova cair
 * nesse buraco.
 */

const CONTROLLERS_ROOT = path.resolve(__dirname, '../http/controllers')

const AUTH_GUARDS = ['auth', 'clientAuth', 'optionalClientAuth', 'requireAdmin']

// Rotas que legitimamente não passam por nenhum hook de auth porque
// autenticam por outro segredo (link de compartilhamento) e por isso
// resolvem a organização na mão com systemPrisma + runAsOrganization antes
// de tocar o client com escopo. Qualquer entrada nova aqui precisa da mesma
// justificativa — não é para "silenciar o teste".
const ALLOWED_WITHOUT_AUTH_HOOK = new Set([
  'labor-calculation/get-shared-calculation.ts',
])

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

// `prisma.<model>.` com `prisma` como identificador isolado — não confunde
// com `systemPrisma.<model>.`, que tem "Prisma" maiúsculo colado a outra
// palavra e por isso nunca casa com o `prisma` minúsculo isolado abaixo.
function referencedTenantModels(source: string): string[] {
  const found = new Set<string>()
  const pattern = /\bprisma\.([a-zA-Z]+)\./g
  let match: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: laço padrão de regex global
  while ((match = pattern.exec(source))) {
    const accessor = match[1]
    const model = accessor.charAt(0).toUpperCase() + accessor.slice(1)
    if (TENANT_MODELS.has(model)) {
      found.add(model)
    }
  }

  return [...found]
}

// Verifica especificamente dentro de blocos `preHandler: [...]`, não em
// qualquer menção textual a essas palavras (um import de
// `@/http/hooks/auth` para outra coisa, por exemplo, não conta).
function hasAuthGuard(source: string): boolean {
  const preHandlerBlocks = source.match(/preHandler:\s*\[[^\]]*\]/g) ?? []
  return preHandlerBlocks.some((block) =>
    AUTH_GUARDS.some((guard) => new RegExp(`\\b${guard}\\b`).test(block)),
  )
}

describe('cobertura de contexto de tenant nos controllers', () => {
  it('todo controller sem hook de auth que toca modelo tenant está na allowlist', () => {
    const files = listTsFiles(CONTROLLERS_ROOT)

    const offenders = files
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return (
          referencedTenantModels(source).length > 0 && !hasAuthGuard(source)
        )
      })
      .map((file) => path.relative(CONTROLLERS_ROOT, file))
      .filter((relativePath) => !ALLOWED_WITHOUT_AUTH_HOOK.has(relativePath))

    expect(offenders).toEqual([])
  })
})
