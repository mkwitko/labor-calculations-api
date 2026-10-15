import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'

/** Mesma lista de `client-portal/get-document-upload-url.ts`. */
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
}

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
export const ATTACHMENT_URL_EXPIRES_IN = 600

export function assertUploadAllowed(input: {
  mimeType: string
  sizeBytes: number
}): void {
  if (!EXTENSIONS[input.mimeType]) {
    throw new BadRequestException(
      'Tipo de arquivo não permitido. Use PDF, JPG, PNG, WEBP ou DOCX.',
    )
  }

  if (input.sizeBytes > MAX_ATTACHMENT_SIZE) {
    throw new BadRequestException('Arquivo muito grande. Tamanho máximo: 25MB.')
  }
}

export function buildAttachmentFileKey(
  caseId: string,
  mimeType: string,
): string {
  return `messages/${caseId}/${randomUUID()}.${EXTENSIONS[mimeType]}`
}
