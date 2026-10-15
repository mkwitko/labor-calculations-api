// Single source of truth for document template placeholders.
// Replaces the three drifting lists (validate Set, generate-document context
// builders, front reference). validate-document-template derives its VALID and
// REQUIRED sets from here; generate-document builds context via resolve().
//
// The definitions live in ./placeholders/* — this file is the public surface:
// derived lookups plus the resolution/validation helpers.

import { PLACEHOLDER_REGISTRY } from './placeholders/defs'
import { getRequiredPlaceholders } from './placeholders/required'
import type {
  PlaceholderDef,
  PlaceholderSource,
  ResolutionContext,
} from './placeholders/types'

export { PLACEHOLDER_REGISTRY } from './placeholders/defs'
export {
  getRequiredPlaceholders,
  REQUIRED_PLACEHOLDERS_BY_TYPE,
} from './placeholders/required'
export type {
  PlaceholderDef,
  PlaceholderGroup,
  PlaceholderSource,
  ResolutionContext,
} from './placeholders/types'

const REGISTRY_BY_KEY = new Map(PLACEHOLDER_REGISTRY.map((p) => [p.key, p]))

export const VALID_PLACEHOLDERS: ReadonlySet<string> = new Set(
  PLACEHOLDER_REGISTRY.map((p) => p.key),
)

// Which entity sources a document type needs, derived from its required set.
export function getRequiredSources(docType: string): PlaceholderSource[] {
  const required = new Set(getRequiredPlaceholders(docType))
  const sources = new Set<PlaceholderSource>()
  for (const def of PLACEHOLDER_REGISTRY) {
    if (required.has(def.key)) sources.add(def.source)
  }
  return [...sources]
}

// Builds the full render context for docxtemplater from whatever entities
// are present. Placeholders whose source entity is absent resolve to '' / '—'.
export function buildRenderContext(
  ctx: ResolutionContext,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const def of PLACEHOLDER_REGISTRY) {
    out[def.key] = def.resolve(ctx)
  }
  return out
}

export function getPlaceholderDef(key: string): PlaceholderDef | undefined {
  return REGISTRY_BY_KEY.get(key)
}
