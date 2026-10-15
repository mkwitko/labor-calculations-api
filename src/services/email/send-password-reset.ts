import { env } from '@/env'
import { sendEmail } from '@/services/email'

/**
 * `officeName` existe porque o mesmo e-mail pode ser cliente de mais de um
 * escritório, e desde que a OAB saiu do formulário cada cadastro recebe um
 * link próprio. Sem o nome no corpo, chegariam dois e-mails idênticos.
 */
export async function sendPasswordResetEmail(
  to: string,
  clientName: string,
  resetLink: string,
  officeName?: string | null,
): Promise<void> {
  await sendEmail({
    to,
    subject: officeName
      ? `Redefinição de senha — ${officeName}`
      : 'Redefinição de Senha — LexLaboral',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">Redefinição de Senha</h2>
        <p style="color:#6b7280;margin-top:0">Olá, ${clientName}!</p>
        <p>Recebemos uma solicitação para redefinir sua senha${officeName ? ` do seu acesso em <strong>${officeName}</strong>` : ''}. Clique no botão abaixo para criar uma nova senha:</p>
        <p style="margin:24px 0">
          <a href="${resetLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
            Redefinir Senha
          </a>
        </p>
        <p style="font-size:13px;color:#9ca3af">
          Este link expira em 1 hora. Se você não solicitou esta redefinição, ignore este email.
        </p>
        <p style="font-size:13px;color:#9ca3af">
          Se o botão não funcionar, copie e cole o seguinte link no navegador:<br/>
          ${resetLink}
        </p>
      </div>
    `,
  })
}

/**
 * Primeiro acesso ao portal. Substitui a senha inicial derivada do CPF: o
 * cliente escolhe a própria senha, e o escritório nunca precisa transmitir
 * credencial por WhatsApp ou telefone.
 */
export async function sendClientPortalInviteEmail(
  to: string,
  clientName: string,
  officeName: string,
  inviteLink: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: `${officeName} criou seu acesso ao portal`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">Seu acesso ao portal</h2>
        <p style="color:#6b7280;margin-top:0">Olá, ${clientName}!</p>
        <p>${officeName} criou um acesso para você acompanhar o seu processo: andamento, documentos, audiências e valores, em linguagem simples.</p>
        <p>Clique no botão abaixo para escolher a sua senha e entrar:</p>
        <p style="margin:24px 0">
          <a href="${inviteLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
            Criar minha senha
          </a>
        </p>
        <p style="font-size:13px;color:#9ca3af">
          Este link expira em 7 dias. Se ele vencer, peça um novo ao seu advogado.
        </p>
        <p style="font-size:13px;color:#9ca3af">
          Se o botão não funcionar, copie e cole o seguinte link no navegador:<br/>
          ${inviteLink}
        </p>
      </div>
    `,
  })
}
