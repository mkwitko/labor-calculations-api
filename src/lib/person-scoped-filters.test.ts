import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

/**
 * Depois do Plano 2A, filtrar modelo tenant pelo `userId` do requisitante é
 * quase sempre bug: quem decide o que se enxerga é o papel. Os pontos legítimos
 * estão nomeados abaixo, com o motivo — dado da pessoa (agenda, OAuth, sessão),
 * autoria (só o autor edita a própria nota) ou autenticação que roda antes de
 * existir contexto de papel (portal do cliente, billing).
 *
 * Arquivo novo que filtre por `userId` entra na lista com justificativa, ou
 * troca o filtro por `caseVisibility`/`calculationVisibility`.
 */
const ALLOWED_USER_FILTERS = new Set<string>([
  // dado da pessoa, não da organização
  'src/http/controllers/agenda-event/list-agenda-events.ts',
  'src/http/controllers/agenda-event/update-agenda-event.ts',
  'src/http/controllers/agenda-event/delete-agenda-event.ts',
  'src/http/controllers/integration/google-calendar.ts',
  'src/services/google/google-calendar.ts',
  'src/services/google/google-oauth.ts',
  // pessoa, sessão e programa de indicação
  'src/http/controllers/user/get-authenticated-user.ts',
  // O checklist de primeiros passos pergunta "**você** já cadastrou seu
  // primeiro cliente / fez seu primeiro cálculo", não "o escritório já fez":
  // alguém que entra numa organização com 500 clientes ainda não passou pelo
  // fluxo. É a mesma semântica que o controller
  // (`get-onboarding-status.ts`) tinha antes de a lógica virar serviço.
  'src/services/onboarding/onboarding-status.ts',
  'src/http/controllers/user/get-user-prefs.ts',
  'src/http/controllers/user/update-user-prefs.ts',
  'src/http/controllers/user/update-user.ts',
  'src/http/controllers/user/delete-user.ts',
  'src/http/controllers/referral/get-referral-summary.ts',
  'src/http/controllers/referral/send-referral-invite.ts',
  'src/services/auth/refresh-token-service.ts',
  'src/services/referral/attribution.ts',
  'src/services/referral/qualify.ts',
  'src/services/referral/tier-engine.ts',
  'src/services/referral/cashback.ts',
  'src/services/referral/reconcile.ts',
  'src/services/tenant/owned-organization.ts',
  'src/services/tenant/resolve-membership.ts',
  // autoria: só quem escreveu a nota a edita ou apaga
  'src/http/controllers/note/update-note.ts',
  'src/http/controllers/note/delete-note.ts',
  // `Membership` é non-tenant e a chave dele é (pessoa, organização): filtrar
  // por `userId` aqui é o que identifica a membership, não escopo de tenant
  'src/http/controllers/organization/list-organizations.ts',
  'src/http/controllers/organization/members.ts',
  'src/http/controllers/organization/accept-invite.ts',
  'src/http/controllers/organization/transfer-ownership.ts',
  // pergunta se duas *pessoas* dividem organização — é o `userId` o objeto da
  // consulta, não um escopo herdado
  'src/services/referral/shared-organization.ts',
  // rodam antes de existir contexto de papel
  'src/http/controllers/client-portal/sign-in.ts',
  'src/http/controllers/client-portal/forgot-password.ts',
  'src/http/controllers/billing/webhook.ts',
])

/**
 * Blocos `where: { ... }`, tolerando um nível de aninhamento
 * (`where: { case: { ... } }`) e quebras de linha. Ancorar em `where:` é o que
 * separa filtro de autoria: `data: { userId }` — quem criou o registro — fica
 * de fora, e deve ficar.
 */
const WHERE_BLOCK = /where:\s*\{(?:[^{}]|\{[^{}]*\})*\}/g

/**
 * `userId` em posição de **chave** (`{ userId }`, `userId: x`), não de valor.
 * `where: { id: userId }` numa consulta a `User` é leitura da própria pessoa,
 * não filtro de tenant — os lookbehinds de `:` e de `.` (para
 * `id: actor.userId`) são o que distingue chave de valor.
 */
const USER_ID_AS_KEY = /(?<!:\s)(?<!:)(?<!\.)\buserId\b\s*[,}:]/

function filtersByUserId(source: string): boolean {
  return (source.match(WHERE_BLOCK) ?? []).some((block) =>
    USER_ID_AS_KEY.test(block),
  )
}

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

it('nenhum arquivo filtra modelo tenant por userId sem justificativa', () => {
  const files = [
    ...listTsFiles('src/http/controllers'),
    ...listTsFiles('src/services'),
  ]

  const offenders = files
    .filter((file) => !ALLOWED_USER_FILTERS.has(file))
    .filter((file) => filtersByUserId(readFileSync(file, 'utf8')))

  expect(offenders).toEqual([])
})
