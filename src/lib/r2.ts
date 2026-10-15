import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/env'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export async function generateUploadUrl(
  key: string,
  mimeType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn },
  )
}

export async function generateDownloadUrl(
  key: string,
  options?: {
    fileName?: string
    mimeType?: string
    expiresIn?: number
  },
): Promise<string> {
  const expiresIn = options?.expiresIn ?? 3600
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ...(options?.fileName
      ? {
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(options.fileName)}"`,
        }
      : {}),
    ...(options?.mimeType ? { ResponseContentType: options.mimeType } : {}),
  })
  return getSignedUrl(r2, command, { expiresIn })
}

export async function deleteObject(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
  )
}

export async function putObject(
  key: string,
  body: Buffer,
  mimeType: string,
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  )
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const obj = await r2.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
  )
  const stream = obj.Body as NodeJS.ReadableStream
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function copyObject(
  sourceKey: string,
  destKey: string,
): Promise<void> {
  await r2.send(
    new CopyObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: destKey,
      CopySource: `${env.R2_BUCKET_NAME}/${sourceKey}`,
    }),
  )
}
