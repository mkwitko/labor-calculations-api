import { randomUUID } from 'node:crypto'
import { connect } from 'node:net'
import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { deleteObject, generateDownloadUrl, getObjectBuffer } from '@/lib/r2'

/**
 * Anexo do suporte: print da tela, vídeo do erro, PDF da fatura.
 *
 * Whitelist de mime, e não blacklist: HTML e SVG ficam de fora de propósito —
 * servidos do nosso domínio, viram XSS com a nossa sessão. O upload vai direto
 * para o R2 por URL assinada, então o servidor nunca segura o arquivo; o que
 * ele guarda é a chave.
 */

const EXTENSIONS: Record<string, string> = {
  // Documentos
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  // Imagens
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  // Vídeos
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export const MAX_SUPPORT_ATTACHMENT_SIZE = 25 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_MESSAGE = 5
export const SUPPORT_UPLOAD_URL_EXPIRES_IN = 600
/** Janela da URL de leitura. Curta porque a tela recarrega quando precisa. */
const DOWNLOAD_URL_EXPIRES_IN = 3600

/** Quanto tempo o arquivo sobrevive ao encerramento do chamado. */
export const ATTACHMENT_RETENTION_DAYS = 180

export type AttachmentInput = {
  fileKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

export function assertSupportUploadAllowed(input: {
  mimeType: string
  sizeBytes: number
}): void {
  if (!EXTENSIONS[input.mimeType]) {
    throw new BadRequestException(
      'Tipo de arquivo não permitido. Use imagem, vídeo, PDF, DOCX, XLSX ou CSV.',
    )
  }

  if (input.sizeBytes > MAX_SUPPORT_ATTACHMENT_SIZE) {
    throw new BadRequestException('Arquivo muito grande. Tamanho máximo: 25MB.')
  }
}

export function assertAttachmentsAllowed(
  attachments: AttachmentInput[] = [],
): void {
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new BadRequestException(
      `Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} arquivos por mensagem.`,
    )
  }

  for (const attachment of attachments) assertSupportUploadAllowed(attachment)
}

/**
 * A chave carrega a organização para a purga e a auditoria conseguirem varrer
 * por prefixo sem consultar o banco.
 */
export function buildSupportFileKey(
  organizationId: string,
  mimeType: string,
): string {
  return `support/${organizationId}/${randomUUID()}.${EXTENSIONS[mimeType]}`
}

type StoredAttachment = {
  id: string
  fileKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  scanStatus: 'pending' | 'clean' | 'infected' | 'skipped'
}

export type AttachmentView = Omit<StoredAttachment, 'fileKey'> & {
  /** Assinada agora, válida por uma hora. Nunca persistida. */
  url: string | null
}

/**
 * Troca a chave por uma URL assinada. Arquivo com vírus não ganha URL: o registro
 * continua visível — quem enviou precisa saber por que o anexo não abre — mas o
 * conteúdo fica inacessível.
 */
export async function withDownloadUrls(
  attachments: StoredAttachment[],
): Promise<AttachmentView[]> {
  return Promise.all(
    attachments.map(async ({ fileKey, ...attachment }) => ({
      ...attachment,
      url:
        attachment.scanStatus === 'infected'
          ? null
          : await generateDownloadUrl(fileKey, {
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              expiresIn: DOWNLOAD_URL_EXPIRES_IN,
            }),
    })),
  )
}

// ---------------------------------------------------------------------------
// Antivírus (clamd, opcional)
// ---------------------------------------------------------------------------

const CLAMD_CHUNK_SIZE = 64 * 1024
const CLAMD_TIMEOUT_MS = 30_000

/**
 * Varre um buffer no clamd pelo protocolo INSTREAM: `zINSTREAM\0`, blocos
 * prefixados pelo tamanho em big-endian e um bloco de tamanho zero fechando.
 *
 * Sem biblioteca porque o protocolo cabe em trinta linhas, e uma dependência a
 * mais no caminho de upload é uma superfície a mais.
 */
function scanBuffer(buffer: Buffer): Promise<string> {
  const { CLAMAV_HOST, CLAMAV_PORT } = env

  return new Promise((resolve, reject) => {
    const socket = connect({ host: CLAMAV_HOST as string, port: CLAMAV_PORT })
    const chunks: Buffer[] = []

    socket.setTimeout(CLAMD_TIMEOUT_MS, () => {
      socket.destroy()
      reject(new Error('clamd timeout'))
    })

    socket.on('error', reject)
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('end', () => resolve(Buffer.concat(chunks).toString().trim()))

    socket.on('connect', () => {
      socket.write('zINSTREAM\0')

      for (let at = 0; at < buffer.length; at += CLAMD_CHUNK_SIZE) {
        const slice = buffer.subarray(at, at + CLAMD_CHUNK_SIZE)
        const size = Buffer.alloc(4)
        size.writeUInt32BE(slice.length)
        socket.write(size)
        socket.write(slice)
      }

      socket.write(Buffer.alloc(4)) // bloco vazio: fim do fluxo
    })
  })
}

/**
 * Varre um anexo já gravado e registra o veredito.
 *
 * Best-effort de propósito: sem `CLAMAV_HOST` o anexo fica `skipped`, e clamd
 * fora do ar deixa `pending` — travar a conversa do suporte porque o antivírus
 * caiu transformaria um incidente em dois. Quem depende da varredura olha
 * `scanStatus`, que nunca mente sobre não ter varrido.
 */
export async function scanAttachment(attachmentId: string): Promise<void> {
  const attachment = await systemPrisma.supportAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, fileKey: true },
  })

  if (!attachment) return

  if (!env.CLAMAV_HOST) {
    await systemPrisma.supportAttachment.update({
      where: { id: attachment.id },
      data: { scanStatus: 'skipped' },
    })
    return
  }

  try {
    const buffer = await getObjectBuffer(attachment.fileKey)
    const verdict = await scanBuffer(buffer)
    const infected = verdict.includes('FOUND')

    await systemPrisma.supportAttachment.update({
      where: { id: attachment.id },
      data: {
        scanStatus: infected ? 'infected' : 'clean',
        scanDetail: infected ? verdict : null,
      },
    })

    // O arquivo infectado sai do bucket na hora: o registro basta para explicar
    // à pessoa por que o anexo não abre.
    if (infected) await deleteObject(attachment.fileKey).catch(() => {})
  } catch (err) {
    console.error('Support attachment scan failed', {
      attachmentId,
      error: err,
    })
  }
}

// ---------------------------------------------------------------------------
// Retenção
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Expurga o anexo de chamado encerrado há mais de `ATTACHMENT_RETENTION_DAYS`.
 *
 * A conversa fica — é o histórico do escritório —, o arquivo vai embora. Print
 * de tela e vídeo costumam carregar dado de cliente, e guardá-los para sempre é
 * risco sem contrapartida.
 */
export async function purgeExpiredSupportAttachments(
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - ATTACHMENT_RETENTION_DAYS * MS_PER_DAY,
  )

  const expired = await systemPrisma.supportAttachment.findMany({
    where: { message: { ticket: { closedAt: { not: null, lte: cutoff } } } },
    select: { id: true, fileKey: true },
    take: 500,
  })

  const results = await Promise.allSettled(
    expired.map(async (attachment) => {
      await deleteObject(attachment.fileKey)
      await systemPrisma.supportAttachment.delete({
        where: { id: attachment.id },
      })
      return attachment.id
    }),
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Support attachment purge failed', {
        error: result.reason,
      })
    }
  }
}
