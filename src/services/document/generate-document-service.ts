import { randomUUID } from 'node:crypto'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { prisma } from 'prisma/prisma'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { generateDownloadUrl, getObjectBuffer, putObject } from '@/lib/r2'
import { requireOrganizationId } from '@/lib/tenant-context'
import type { TenantActor } from '@/services/tenant/actor'
import { brandingForOrganization } from '@/services/tenant/organization-branding'
import {
  calculationVisibility,
  caseVisibility,
} from '@/services/tenant/visibility'
import {
  buildRenderContext,
  getRequiredSources,
  type ResolutionContext,
} from './placeholder-registry'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Campos pessoais do advogado, que continuam em User. Identidade visual
// (officeName, phone, brandPrimaryColor etc.) pertence à organização — veja
// `brandingForOrganization` logo abaixo.
const LAWYER_SELECT = {
  name: true,
  mail: true,
  oabNumber: true,
} as const

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-')
}

// Resolves the entities a document needs, starting from any of calculation /
// case / client. A calculation pulls in its linked case and client (FKs).
export async function resolveContext(
  actor: TenantActor,
  refs: { calculationId?: string; caseId?: string; clientId?: string },
): Promise<{
  context: ResolutionContext
  primaryName: string
  scopeId: string
}> {
  const lawyer = await prisma.user.findFirst({
    where: { id: actor.userId, deletedAt: null },
    select: LAWYER_SELECT,
  })

  // A marca (papel timbrado, logotipo, cor, telefone do escritório) pertence
  // à organização, não à pessoa — dois advogados do mesmo escritório geram
  // peça com o mesmo timbre. `brandingForUser(userId)` resolveria pela regra
  // de "organização em que a pessoa é owner", o que devolve `null` para
  // qualquer `lawyer`/`admin` que não seja dono — exatamente o caso comum
  // num escritório com vários assentos. Os dois chamadores (rota legada e
  // composable) rodam atrás de `preHandler: [auth]`, que já ativou a
  // organização do request, então usamos o mesmo mecanismo do resto desta
  // tarefa: `requireOrganizationId()`.
  const branding = await brandingForOrganization(requireOrganizationId())
  const lawyerWithBranding = lawyer ? { ...lawyer, ...branding } : null

  let calculation: Record<string, unknown> | null = null
  let caseRow: Record<string, unknown> | null = null
  let client: Record<string, unknown> | null = null

  if (refs.calculationId) {
    calculation = (await prisma.laborCalculation.findFirst({
      where: {
        id: refs.calculationId,
        ...calculationVisibility(actor),
        deletedAt: null,
      },
    })) as Record<string, unknown> | null
    if (!calculation) {
      throw new ResourceNotFoundException('Cálculo não encontrado')
    }
  }

  const caseId = refs.caseId ?? (calculation?.caseId as string | undefined)
  if (caseId) {
    caseRow = (await prisma.case.findFirst({
      where: { id: caseId, ...caseVisibility(actor), deletedAt: null },
    })) as Record<string, unknown> | null
  }

  const clientId =
    refs.clientId ??
    (calculation?.clientId as string | undefined) ??
    (caseRow?.clientId as string | undefined)
  if (clientId) {
    client = (await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
    })) as Record<string, unknown> | null
  }

  const primaryName =
    String(client?.name ?? '') ||
    String(calculation?.clientName ?? '') ||
    String(caseRow?.title ?? '') ||
    'documento'
  const scopeId =
    refs.calculationId ?? refs.caseId ?? refs.clientId ?? 'sem-vinculo'

  return {
    context: { calculation, case: caseRow, client, lawyer: lawyerWithBranding },
    primaryName,
    scopeId,
  }
}

async function renderTemplateToR2(input: {
  templateId: string
  context: ResolutionContext
  primaryName: string
  scopeId: string
}): Promise<{ downloadUrl: string; fileName: string; fileKey: string }> {
  const { templateId, context, primaryName, scopeId } = input

  // Modelo é da organização: o clone por organização (Plano 1) já garante que
  // toda organização tem os de sistema, então filtrar por pessoa só esconderia
  // do associado o modelo que o sócio criou.
  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId },
  })
  if (!template || !template.fileKey) {
    throw new ResourceNotFoundException(
      'Template não encontrado ou sem arquivo',
    )
  }

  // Ensure the provided entities cover the template's required sources.
  const requiredSources = getRequiredSources(template.type)
  for (const src of requiredSources) {
    if (src === 'system') continue
    if (src === 'calculation' && !context.calculation) {
      throw new ResourceNotFoundException(
        'Este template exige dados de cálculo. Selecione um cálculo.',
      )
    }
    if (src === 'client' && !context.client && !context.calculation) {
      throw new ResourceNotFoundException(
        'Este template exige dados do cliente.',
      )
    }
    if (src === 'case' && !context.case) {
      throw new ResourceNotFoundException('Este template exige dados do caso.')
    }
  }

  const templateBuffer = await getObjectBuffer(template.fileKey)
  const zip = new PizZip(templateBuffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  })

  doc.render(buildRenderContext(context))

  const generatedBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  })

  const fileName = `${slugify(template.name)}-${slugify(primaryName)}.docx`
  const fileKey = `generated/${scopeId}/${randomUUID()}.docx`

  // Server-side PUT (was: presigned URL round-trip + fetch)
  await putObject(fileKey, generatedBuffer, DOCX_MIME)

  const downloadUrl = await generateDownloadUrl(fileKey, {
    fileName,
    mimeType: DOCX_MIME,
  })

  return { downloadUrl, fileName, fileKey }
}

// Legacy entry point: generate strictly from a calculation.
export async function generateDocumentFromTemplate(input: {
  calculationId: string
  templateId: string
  actor: TenantActor
}): Promise<{ downloadUrl: string; fileName: string; fileKey: string }> {
  return generateDocumentComposable({
    actor: input.actor,
    templateId: input.templateId,
    calculationId: input.calculationId,
  })
}

// Composable entry point: generate from any combination of calculation / case
// / client. A calculation auto-resolves its linked case and client.
export async function generateDocumentComposable(input: {
  actor: TenantActor
  templateId: string
  calculationId?: string
  caseId?: string
  clientId?: string
}): Promise<{ downloadUrl: string; fileName: string; fileKey: string }> {
  const { actor, templateId, ...refs } = input

  if (!refs.calculationId && !refs.caseId && !refs.clientId) {
    throw new ResourceNotFoundException(
      'Informe um cálculo, caso ou cliente para gerar o documento.',
    )
  }

  const { context, primaryName, scopeId } = await resolveContext(actor, refs)

  return renderTemplateToR2({
    templateId,
    context,
    primaryName,
    scopeId,
  })
}
