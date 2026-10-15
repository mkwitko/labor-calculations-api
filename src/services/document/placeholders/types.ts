// Types for the document-template placeholder registry.

export type PlaceholderGroup =
  | 'cliente'
  | 'contrato'
  | 'verbas'
  | 'liquidacao'
  | 'advogado'
  | 'caso'
  | 'sistema'

export type PlaceholderSource =
  | 'calculation'
  | 'client'
  | 'case'
  | 'lawyer'
  | 'system'

// Raw entities passed to resolvers. calculation/client/case are Prisma rows
// (Decimal-carrying), lawyer is the selected User fields.
export type ResolutionContext = {
  calculation?: Record<string, unknown> | null
  client?: Record<string, unknown> | null
  case?: Record<string, unknown> | null
  lawyer?: Record<string, unknown> | null
}

export type PlaceholderDef = {
  key: string
  label: string
  description: string
  group: PlaceholderGroup
  source: PlaceholderSource
  example: string
  resolve: (ctx: ResolutionContext) => string
}
