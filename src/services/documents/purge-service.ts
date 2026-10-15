import { systemPrisma as prisma } from 'prisma/prisma'
import { deleteObject } from '@/lib/r2'

const RETENTION_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

export async function purgeDeletedDocuments(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY)

  const expired = await prisma.document.findMany({
    where: { deletedAt: { not: null, lte: cutoff } },
    select: { id: true, fileKey: true },
  })

  const results = await Promise.allSettled(
    expired.map(async (doc) => {
      await deleteObject(doc.fileKey)
      await prisma.document.delete({
        where: { id: doc.id },
      })
      return doc.id
    }),
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      console.log('Document purged', {
        documentId: result.value,
      })
    } else {
      console.error('Document purge failed', {
        error: result.reason,
      })
    }
  }
}
