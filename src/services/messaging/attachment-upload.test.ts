import { describe, expect, it } from 'vitest'
import {
  assertUploadAllowed,
  buildAttachmentFileKey,
} from './attachment-upload'

describe('assertUploadAllowed', () => {
  it('aceita pdf dentro do limite', () => {
    expect(() =>
      assertUploadAllowed({ mimeType: 'application/pdf', sizeBytes: 1024 }),
    ).not.toThrow()
  })

  it('recusa mime fora da lista', () => {
    expect(() =>
      assertUploadAllowed({ mimeType: 'application/zip', sizeBytes: 1024 }),
    ).toThrow('Tipo de arquivo não permitido')
  })

  it('recusa acima de 25 MB', () => {
    expect(() =>
      assertUploadAllowed({
        mimeType: 'application/pdf',
        sizeBytes: 26 * 1024 * 1024,
      }),
    ).toThrow('Arquivo muito grande')
  })
})

describe('buildAttachmentFileKey', () => {
  it('usa a extensão do mime e prefixo do caso', () => {
    const key = buildAttachmentFileKey('case_1', 'image/png')
    expect(key.startsWith('messages/case_1/')).toBe(true)
    expect(key.endsWith('.png')).toBe(true)
  })
})
