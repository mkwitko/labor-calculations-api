import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runAsOrganization } from '@/lib/tenant-context'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'
import {
  createMessage,
  listMessages,
  markMessagesRead,
  unreadCountForClient,
  unreadCountForLawyer,
} from './message-service'

let ctx: Awaited<ReturnType<typeof seed>>

async function seed() {
  const { user, organization } = await createTestUser()

  const client = await systemPrisma.client.create({
    data: {
      name: 'Joana Cliente',
      userId: user.id,
      organizationId: organization.id,
    },
  })

  const kase = await systemPrisma.case.create({
    data: {
      title: 'Reclamatória',
      assignedToId: user.id,
      organizationId: organization.id,
      clientId: client.id,
    },
  })

  const document = await systemPrisma.document.create({
    data: {
      caseId: kase.id,
      userId: user.id,
      organizationId: organization.id,
      kind: 'outros',
      fileKey: 'k/1.pdf',
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
    },
  })

  return {
    organizationId: organization.id,
    ownerUserId: user.id,
    clientId: client.id,
    caseId: kase.id,
    documentId: document.id,
  }
}

beforeEach(async () => {
  await cleanDatabase()
  ctx = await seed()
})

afterAll(async () => {
  await systemPrisma.$disconnect()
})

describe('createMessage', () => {
  it('grava mensagem do advogado', async () => {
    const created = await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'lawyer', userId: ctx.ownerUserId },
        body: 'Bom dia',
      }),
    )

    const row = await systemPrisma.message.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(row.authorKind).toBe('lawyer')
    expect(row.userId).toBe(ctx.ownerUserId)
    expect(row.clientId).toBeNull()
    expect(row.readByLawyerAt).not.toBeNull()
    expect(row.readByClientAt).toBeNull()
  })

  it('grava mensagem do cliente', async () => {
    const created = await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'client', clientId: ctx.clientId },
        body: 'Recebi',
      }),
    )

    const row = await systemPrisma.message.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(row.authorKind).toBe('client')
    expect(row.clientId).toBe(ctx.clientId)
    expect(row.userId).toBeNull()
    expect(row.readByClientAt).not.toBeNull()
    expect(row.readByLawyerAt).toBeNull()
  })

  it('recusa corpo vazio sem anexo', async () => {
    await expect(
      runAsOrganization(ctx.organizationId, () =>
        createMessage({
          caseId: ctx.caseId,
          author: { kind: 'lawyer', userId: ctx.ownerUserId },
          body: '   ',
        }),
      ),
    ).rejects.toThrow('Mensagem vazia')
  })

  it('aceita corpo vazio quando há anexo', async () => {
    const created = await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'lawyer', userId: ctx.ownerUserId },
        body: '',
        attachmentDocumentIds: [ctx.documentId],
      }),
    )

    const attachments = await systemPrisma.messageAttachment.findMany({
      where: { messageId: created.id },
    })
    expect(attachments).toHaveLength(1)
    expect(attachments[0].documentId).toBe(ctx.documentId)
  })

  it('recusa anexo de outro caso', async () => {
    const other = await systemPrisma.case.create({
      data: {
        title: 'Outro',
        assignedToId: ctx.ownerUserId,
        organizationId: ctx.organizationId,
      },
    })
    const alien = await systemPrisma.document.create({
      data: {
        caseId: other.id,
        userId: ctx.ownerUserId,
        organizationId: ctx.organizationId,
        kind: 'outros',
        fileKey: 'k/2.pdf',
        fileName: 'alheio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    })

    await expect(
      runAsOrganization(ctx.organizationId, () =>
        createMessage({
          caseId: ctx.caseId,
          author: { kind: 'lawyer', userId: ctx.ownerUserId },
          body: 'segue',
          attachmentDocumentIds: [alien.id],
        }),
      ),
    ).rejects.toThrow('Anexo inválido')
  })

  it('recusa anexo já preso a outra mensagem', async () => {
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'lawyer', userId: ctx.ownerUserId },
        body: '',
        attachmentDocumentIds: [ctx.documentId],
      }),
    )

    await expect(
      runAsOrganization(ctx.organizationId, () =>
        createMessage({
          caseId: ctx.caseId,
          author: { kind: 'lawyer', userId: ctx.ownerUserId },
          body: 'de novo',
          attachmentDocumentIds: [ctx.documentId],
        }),
      ),
    ).rejects.toThrow('Anexo inválido')
  })
})

describe('listMessages', () => {
  it('devolve mais recente primeiro e pagina por cursor', async () => {
    for (const body of ['um', 'dois', 'três']) {
      await runAsOrganization(ctx.organizationId, () =>
        createMessage({
          caseId: ctx.caseId,
          author: { kind: 'lawyer', userId: ctx.ownerUserId },
          body,
        }),
      )
    }

    const first = await runAsOrganization(ctx.organizationId, () =>
      listMessages({ caseId: ctx.caseId, viewer: 'lawyer', limit: 2 }),
    )
    expect(first.items.map((i) => i.body)).toEqual(['três', 'dois'])
    expect(first.nextCursor).toBe(first.items[1].id)

    const second = await runAsOrganization(ctx.organizationId, () =>
      listMessages({
        caseId: ctx.caseId,
        viewer: 'lawyer',
        limit: 2,
        // biome-ignore lint/style/noNonNullAssertion: o teste acabou de checar
        cursor: first.nextCursor!,
      }),
    )
    expect(second.items.map((i) => i.body)).toEqual(['um'])
    expect(second.nextCursor).toBeNull()
  })

  it('chama de "Você" só o que o próprio leitor escreveu', async () => {
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'client', clientId: ctx.clientId },
        body: 'oi',
      }),
    )

    const asClient = await runAsOrganization(ctx.organizationId, () =>
      listMessages({ caseId: ctx.caseId, viewer: 'client' }),
    )
    expect(asClient.items[0].authorName).toBe('Você')

    const asLawyer = await runAsOrganization(ctx.organizationId, () =>
      listMessages({ caseId: ctx.caseId, viewer: 'lawyer' }),
    )
    expect(asLawyer.items[0].authorName).toBe('Joana Cliente')
  })
})

describe('markMessagesRead', () => {
  it('marca só o que o outro lado escreveu e não regrava timestamp', async () => {
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'client', clientId: ctx.clientId },
        body: 'pergunta',
      }),
    )
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'lawyer', userId: ctx.ownerUserId },
        body: 'resposta',
      }),
    )

    const first = await runAsOrganization(ctx.organizationId, () =>
      markMessagesRead({ caseId: ctx.caseId, viewer: 'lawyer' }),
    )
    expect(first.updated).toBe(1)

    const again = await runAsOrganization(ctx.organizationId, () =>
      markMessagesRead({ caseId: ctx.caseId, viewer: 'lawyer' }),
    )
    expect(again.updated).toBe(0)
  })
})

describe('unreadCount', () => {
  it('conta por caso o que o leitor ainda não viu', async () => {
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'client', clientId: ctx.clientId },
        body: 'a',
      }),
    )
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'client', clientId: ctx.clientId },
        body: 'b',
      }),
    )

    const lawyer = await runAsOrganization(ctx.organizationId, () =>
      unreadCountForLawyer({
        userId: ctx.ownerUserId,
        organizationId: ctx.organizationId,
        role: 'owner',
      }),
    )
    expect(lawyer.total).toBe(2)
    expect(lawyer.byCase).toEqual([{ caseId: ctx.caseId, count: 2 }])

    const client = await runAsOrganization(ctx.organizationId, () =>
      unreadCountForClient(ctx.clientId),
    )
    expect(client.total).toBe(0)
  })
})

describe('aviso ao cliente', () => {
  it('cria notificação quando o advogado escreve', async () => {
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'lawyer', userId: ctx.ownerUserId },
        body: 'Precisamos do seu contracheque de março',
      }),
    )

    const notifications = await systemPrisma.clientNotification.findMany({
      where: { clientId: ctx.clientId },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('message_received')
    expect(notifications[0].link).toBe(`/portal/casos/${ctx.caseId}`)
  })

  it('não cria notificação quando quem escreve é o cliente', async () => {
    await runAsOrganization(ctx.organizationId, () =>
      createMessage({
        caseId: ctx.caseId,
        author: { kind: 'client', clientId: ctx.clientId },
        body: 'segue anexo',
      }),
    )

    const notifications = await systemPrisma.clientNotification.findMany({
      where: { clientId: ctx.clientId },
    })
    expect(notifications).toHaveLength(0)
  })
})
