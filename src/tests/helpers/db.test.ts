import { afterEach, describe, expect, it } from 'vitest'
import { assertTestDatabase } from './db'

/**
 * A guarda existe porque `vitest` rodado direto (sem `pnpm test`) carrega o
 * `.env` de desenvolvimento: em 2026-08-06 um `deleteMany` de teste chegou ao
 * banco de desenvolvimento por esse caminho. `cleanDatabase` faz TRUNCATE
 * CASCADE — no banco errado, é irreversível sem restore.
 */

const original = process.env.DATABASE_URL

afterEach(() => {
  process.env.DATABASE_URL = original
})

function withUrl(url: string | undefined) {
  if (url === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = url
  return () => assertTestDatabase()
}

describe('assertTestDatabase', () => {
  it('aceita o Postgres local de teste', () => {
    expect(
      withUrl(
        'postgresql://test:test@localhost:5433/labor_calculations_test?schema=public',
      ),
    ).not.toThrow()
  })

  it('aceita 127.0.0.1', () => {
    expect(
      withUrl('postgresql://test:test@127.0.0.1:5433/labor_calculations_test'),
    ).not.toThrow()
  })

  it('recusa host remoto', () => {
    expect(
      withUrl(
        'postgresql://u:p@ep-tiny-river.sa-east-1.aws.neon.tech/labor_calculations_test',
      ),
    ).toThrow(/não é um banco de teste local/)
  })

  it('recusa banco local sem sufixo _test', () => {
    expect(withUrl('postgresql://u:p@localhost:5432/labor_calculations')).toThrow(
      /não é um banco de teste local/,
    )
  })

  it('recusa DATABASE_URL ausente', () => {
    expect(withUrl(undefined)).toThrow(/ausente ou inválida/)
  })

  it('recusa DATABASE_URL inválida', () => {
    expect(withUrl('nao-e-url')).toThrow(/ausente ou inválida/)
  })
})
