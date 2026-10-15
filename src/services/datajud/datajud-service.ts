import { env } from '@/env'

export type DataJudMovement = {
  externalId: string
  date: Date
  code: string | null
  description: string
}

// CNJ number: NNNNNNN-DD.AAAA.J.TR.OOOO
// J = judicial segment (5 = Justiça do Trabalho), TR = tribunal (TRT region).
export function parseCnjNumber(
  raw: string,
): { digits: string; segment: string; tribunal: string } | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 20) return null
  // positions: 7 (sequencial) + 2 (dv) + 4 (ano) + 1 (segmento) + 2 (tribunal) + 4 (origem)
  const segment = digits.slice(13, 14)
  const tribunal = digits.slice(14, 16)
  return { digits, segment, tribunal }
}

// Maps a CNJ number to the DataJud public index alias. Only the labor branch
// (segment 5) is supported: TRT das regiões 1 a 24 e o TST.
export function datajudAliasFor(processNumber: string): string | null {
  const parsed = parseCnjNumber(processNumber)
  if (!parsed) return null
  if (parsed.segment !== '5') return null // only Justiça do Trabalho

  const region = Number(parsed.tribunal)

  // Tribunal `00` é o TST, e o índice dele tem alias próprio. Sem este caso o
  // número de processo do TST virava `api_publica_trt0`, alias que não existe:
  // o DataJud respondia 404 e a tela dizia "não foi possível sincronizar" para
  // um processo perfeitamente válido.
  if (region === 0) return 'api_publica_tst'

  // Fora da faixa das regiões não existe índice; devolver `null` faz a
  // sincronização terminar em zero em vez de estourar contra um 404.
  if (region < 1 || region > 24) return null

  return `api_publica_trt${region}`
}

type DataJudHit = {
  _source?: {
    movimentos?: {
      codigo?: number
      nome?: string
      dataHora?: string
    }[]
  }
}

// Fetches process movements from the CNJ DataJud public API.
// Returns [] when the number can't be resolved or nothing is found.
export async function fetchDataJudMovements(
  processNumber: string,
): Promise<DataJudMovement[]> {
  const alias = datajudAliasFor(processNumber)
  if (!alias) return []
  const parsed = parseCnjNumber(processNumber)
  if (!parsed) return []

  if (!env.DATAJUD_API_KEY) {
    throw new Error('DATAJUD_API_KEY não configurada')
  }

  const url = `${env.DATAJUD_BASE_URL}/${alias}/_search`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `APIKey ${env.DATAJUD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { match: { numeroProcesso: parsed.digits } },
      size: 1,
    }),
  })

  if (!res.ok) {
    throw new Error(`DataJud respondeu ${res.status}`)
  }

  const json = (await res.json()) as {
    hits?: { hits?: DataJudHit[] }
  }
  const hit = json.hits?.hits?.[0]
  const movimentos = hit?._source?.movimentos ?? []

  return movimentos
    .filter((m) => m.dataHora)
    .map((m) => {
      const date = new Date(m.dataHora as string)
      const code = m.codigo != null ? String(m.codigo) : null
      const description = m.nome ?? 'Movimentação'
      // externalId dedupes on re-sync: code + timestamp is stable per movement.
      const externalId = `${code ?? 'x'}-${date.getTime()}`
      return { externalId, date, code, description }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}
