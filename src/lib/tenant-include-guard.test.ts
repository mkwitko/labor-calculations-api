import { globSync, readFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { NON_TENANT_MODELS, TENANT_MODELS } from './tenant-models'

/**
 * Por raiz não-tenant, os nomes REAIS de campo que apontam para modelo tenant,
 * lidos do DMMF. Não se inventa regra de plural aqui: `User.activities` aponta
 * para `Activity`, e nenhuma singularização ingênua acerta isso — foi assim que
 * uma relação que existe hoje no schema passou pela guarda sem ser vista.
 *
 * `Organization` fica de fora: incluir modelo tenant a partir dela é o caso
 * legítimo, e a Tarefa 2 declarou essas relações de propósito.
 */
const TENANT_RELATIONS_BY_ROOT = new Map<string, Set<string>>()

for (const model of Prisma.dmmf.datamodel.models) {
  if (!NON_TENANT_MODELS.has(model.name)) continue
  if (model.name === 'Organization') continue

  const relations = model.fields
    .filter((field) => field.kind === 'object' && TENANT_MODELS.has(field.type))
    .map((field) => field.name)

  if (relations.length > 0) {
    TENANT_RELATIONS_BY_ROOT.set(
      model.name.charAt(0).toLowerCase() + model.name.slice(1),
      new Set(relations),
    )
  }
}

// `include` e `select` alcançam a mesma relação aninhada. Cobrir só um dos dois
// deixa a porta aberta pelo outro.
const SHAPING_KEYS = new Set(['include', 'select'])

/** `prisma.<raiz>.<metodo>` -> a raiz, se ela for não-tenant. */
function riskyRootOf(expression: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) return undefined

  const target = expression.expression

  if (!ts.isPropertyAccessExpression(target)) return undefined
  if (!ts.isIdentifier(target.expression)) return undefined
  if (target.expression.text !== 'prisma') return undefined

  const root = target.name.text

  return TENANT_RELATIONS_BY_ROOT.has(root) ? root : undefined
}

function propertyName(prop: ts.ObjectLiteralElementLike): string | undefined {
  const name = prop.name

  if (!name) return undefined
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text

  return undefined
}

/** Nome de relação tenant em qualquer profundidade do objeto de include/select. */
function tenantRelationIn(
  node: ts.Node,
  relations: Set<string>,
): string | undefined {
  let found: string | undefined

  const visit = (current: ts.Node): void => {
    if (found) return

    if (
      ts.isPropertyAssignment(current) ||
      ts.isShorthandPropertyAssignment(current)
    ) {
      const name = propertyName(current)

      if (name && relations.has(name)) {
        found = name
        return
      }
    }

    ts.forEachChild(current, visit)
  }

  visit(node)

  return found
}

/**
 * Acha `include` de modelo tenant a partir de raiz não-tenant.
 *
 * Usa o parser do TypeScript, e não texto: as três versões anteriores deste
 * detector erraram justamente por tentar adivinhar a estrutura lexical do
 * JavaScript — uma não podia falhar, uma tinha janela de tamanho fixo que
 * atravessava o fim da consulta, e uma contava chaves sem saber o que era
 * string, comentário ou literal de regex. O AST não tem esse problema.
 *
 * Limitação inerente: só vê literal de objeto inline. Uma chamada montada a
 * partir de variável (`prisma.user.findUnique(args)`) é invisível aqui.
 *
 * Nos sete arquivos de sistema, `prisma` é apelido de `systemPrisma`
 * (`import { systemPrisma as prisma }`), que é o client sem escopo de
 * propósito. Se a varredura acusar um deles, confirme que é arquivo de sistema
 * e registre a exceção explicitamente — não afrouxe o detector.
 */
function includeOffenders(source: string, fileName = 'input.ts'): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  const offenders: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const root = riskyRootOf(node.expression)
      const [arg] = node.arguments

      if (root && arg && ts.isObjectLiteralExpression(arg)) {
        const relations = TENANT_RELATIONS_BY_ROOT.get(root)

        for (const prop of arg.properties) {
          const key = propertyName(prop)

          if (
            key &&
            SHAPING_KEYS.has(key) &&
            relations &&
            ts.isPropertyAssignment(prop)
          ) {
            const reached = tenantRelationIn(prop.initializer, relations)

            if (reached) {
              offenders.push(`prisma.${root} alcança ${reached} via ${key}`)
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return offenders
}

describe('include a partir de raiz não-tenant', () => {
  // Este teste existe porque a primeira versão do detector não podia falhar.
  it('o detector pega ofensor e poupa caso legítimo', () => {
    expect(
      includeOffenders(
        'await prisma.user.findUnique({ where: { id }, include: { cases: true } })',
      ),
    ).not.toEqual([])

    expect(
      includeOffenders(
        'await prisma.user.findUnique({ include: { memberships: { include: { cases: true } } } })',
      ),
    ).not.toEqual([])

    expect(
      includeOffenders(
        'await prisma.case.findMany({ include: { caseTasks: true } })',
      ),
    ).toEqual([])

    expect(
      includeOffenders(
        'await prisma.user.findUnique({ include: { memberships: true } })',
      ),
    ).toEqual([])

    // Um falso positivo real: a janela sem contagem de chaves atravessava o fim
    // desta consulta e caía na seguinte, que tem include mas raiz tenant.
    expect(
      includeOffenders(
        `const e = await prisma.googleIntegration.findUnique({ where: { userId } })\nif (!e) return\nawait prisma.hearing.findUnique({ where: { id }, include: { case: true } })`,
      ),
    ).toEqual([])

    // Falso negativo que a contagem crua de chaves deixava passar: o `}` dentro
    // da string truncava a janela antes do include.
    expect(
      includeOffenders(
        'await prisma.user.findUnique({ where: { mail: "a}b" }, include: { cases: true } })',
      ),
    ).not.toEqual([])

    // Escape dentro de string não pode reabrir o mesmo problema.
    expect(
      includeOffenders(
        'await prisma.user.findUnique({ where: { q: "diz \\"}\\" ok" }, include: { cases: true } })',
      ),
    ).not.toEqual([])

    // Falso positivo: include comentado não é consulta.
    expect(
      includeOffenders(
        'await prisma.user.findUnique({\n  where: { id },\n  // include: { cases: true }\n})',
      ),
    ).toEqual([])

    // Falso positivo: `{` em string não pode fazer a janela invadir a consulta
    // seguinte, que tem include mas raiz tenant.
    expect(
      includeOffenders(
        'await prisma.user.findUnique({ where: { name: "a{b" } })\nawait prisma.hearing.findUnique({ where: { id }, include: { case: true } })',
      ),
    ).toEqual([])

    // Literal de regex: `"` dentro de classe de caracteres abria string
    // fantasma no scanner textual e engolia a consulta seguinte.
    expect(
      includeOffenders(
        'const re = /["{]/\nawait prisma.user.findUnique({ include: { cases: true } })',
      ),
    ).not.toEqual([])

    // Template aninhado dessincronizava a contagem de backticks.
    expect(
      includeOffenders(
        'const s = `a${`b`}c`\nawait prisma.user.findUnique({ include: { cases: true } })',
      ),
    ).not.toEqual([])

    // Divisão não é regex — a ambiguidade que nenhum scanner à mão resolve.
    expect(
      includeOffenders(
        'const x = a / b / c\nawait prisma.user.findUnique({ include: { cases: true } })',
      ),
    ).not.toEqual([])

    // Limitação documentada: args em variável são invisíveis ao guard.
    expect(
      includeOffenders(
        'const q = { include: { cases: true } }\nawait prisma.user.findUnique(q)',
      ),
    ).toEqual([])

    // `select` alcança a mesma relação que `include` — cobrir só um dos dois
    // deixa a porta aberta pelo outro.
    expect(
      includeOffenders(
        'await prisma.user.findUnique({ where: { id }, select: { cases: true } })',
      ),
    ).not.toEqual([])

    expect(
      includeOffenders(
        'await prisma.user.findUnique({ select: { cases: { select: { id: true } } } })',
      ),
    ).not.toEqual([])

    // `User.activities` aponta para `Activity`. Nenhuma singularização ingênua
    // acerta: 'activities' sem o `s` final é 'activitie'.
    expect(
      includeOffenders(
        'await prisma.user.findMany({ include: { activities: true } })',
      ),
    ).not.toEqual([])

    // `select` de campo escalar não é relação.
    expect(
      includeOffenders(
        'await prisma.user.findUnique({ select: { name: true, mail: true } })',
      ),
    ).toEqual([])

    expect(
      includeOffenders(
        'await prisma.user.findUnique({ select: { memberships: true } })',
      ),
    ).toEqual([])

    // Raiz que não declara nenhuma relação tenant não é vigiada.
    expect(
      includeOffenders(
        'await prisma.membership.findMany({ include: { organization: true } })',
      ),
    ).toEqual([])
  })

  it('nenhum arquivo do repositório faz isso', () => {
    const files = globSync('src/**/*.ts').filter(
      (file) => !file.endsWith('.test.ts'),
    )

    const offenders = files.flatMap((file) =>
      includeOffenders(readFileSync(file, 'utf8'), file).map(
        (hit) => `${file}: ${hit}`,
      ),
    )

    expect(offenders).toEqual([])
  })
})
