import { systemPrisma } from 'prisma/prisma'
import { sendClientPortalInviteEmail } from '@/services/email/send-password-reset'
import {
  buildClientInviteUrl,
  issueClientAccessToken,
} from './client-access-token'

/**
 * Emite o convite de primeiro acesso ao portal e tenta avisar por e-mail.
 *
 * A URL volta na resposta de propósito, como no convite de advogado: quem
 * dispara é o escritório, e "copiar link" precisa funcionar para o cliente que
 * não tem e-mail cadastrado ou que não recebeu a mensagem. Falha de envio não
 * derruba a criação do cliente — o link já existe.
 */
export async function sendClientPortalInvite(params: {
  clientId: string
  organizationId: string
}): Promise<{ inviteUrl: string; emailSent: boolean }> {
  const { token } = await issueClientAccessToken({
    clientId: params.clientId,
    organizationId: params.organizationId,
    purpose: 'invite',
  })

  const inviteUrl = buildClientInviteUrl(token)

  const client = await systemPrisma.client.findUnique({
    where: { id: params.clientId },
    select: { name: true, mail: true },
  })

  const organization = await systemPrisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { name: true },
  })

  if (!client?.mail) {
    return { inviteUrl, emailSent: false }
  }

  const sent = await sendClientPortalInviteEmail(
    client.mail,
    client.name,
    organization?.name ?? 'Seu advogado',
    inviteUrl,
  )
    .then(() => true)
    .catch((err) => {
      console.error('Failed to send client portal invite', { error: err })
      return false
    })

  return { inviteUrl, emailSent: sent }
}
