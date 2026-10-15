import { env } from '@/env'

const INGEST_URL = 'https://api.axiom.co/v1/datasets'

export const axiomEnabled = !!env.AXIOM_TOKEN && !!env.AXIOM_DATASET

// Best-effort structured log shipping to Axiom. Never throws — a logging
// failure must not affect the request.
export function logToAxiom(event: Record<string, unknown>): void {
  if (!axiomEnabled) return
  fetch(`${INGEST_URL}/${env.AXIOM_DATASET}/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AXIOM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ _time: new Date().toISOString(), ...event }]),
  }).catch(() => undefined)
}
