// Typed e-mail templates with a single base layout. Replaces the HTML strings
// that were inlined and duplicated across the case / client-portal controllers.

export type EmailContent = { subject: string; html: string }

function baseLayout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <h2 style="margin-bottom:4px">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:24px;font-size:13px;color:#9ca3af">
        Acesse o portal para mais detalhes.
      </p>
    </div>
  `
}

export const emailTemplates = {
  documentApproved: (p: {
    clientName: string
    docName: string
    caseTitle: string
  }): EmailContent => ({
    subject: 'Documento Aprovado — LexLaboral',
    html: baseLayout(
      'Documento Aprovado',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.clientName}!</p>
       <p>Seu documento <strong>${p.docName}</strong> no caso <strong>${p.caseTitle}</strong> foi aprovado.</p>`,
    ),
  }),

  documentRejected: (p: {
    clientName: string
    docName: string
    caseTitle: string
    reason: string
  }): EmailContent => ({
    subject: 'Documento Rejeitado — LexLaboral',
    html: baseLayout(
      'Documento Rejeitado',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.clientName}!</p>
       <p>Seu documento <strong>${p.docName}</strong> no caso <strong>${p.caseTitle}</strong> foi rejeitado.</p>
       <p><strong>Motivo:</strong> ${p.reason}</p>
       <p>Por favor, envie um novo documento corrigido.</p>`,
    ),
  }),

  documentUploaded: (p: {
    lawyerName: string
    docName: string
    caseTitle: string
  }): EmailContent => ({
    subject: 'Novo Documento Enviado — LexLaboral',
    html: baseLayout(
      'Novo Documento Enviado',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.lawyerName}!</p>
       <p>O cliente enviou o documento <strong>${p.docName}</strong> no caso <strong>${p.caseTitle}</strong>.</p>`,
    ),
  }),

  settlementAccepted: (p: {
    lawyerName: string
    caseTitle: string
  }): EmailContent => ({
    subject: 'Acordo Aceito — LexLaboral',
    html: baseLayout(
      'Acordo Aceito',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.lawyerName}!</p>
       <p>O cliente aceitou a proposta de acordo no caso <strong>${p.caseTitle}</strong>.</p>`,
    ),
  }),

  settlementRejected: (p: {
    lawyerName: string
    caseTitle: string
    reason?: string
  }): EmailContent => ({
    subject: 'Acordo Recusado — LexLaboral',
    html: baseLayout(
      'Acordo Recusado',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.lawyerName}!</p>
       <p>O cliente recusou a proposta de acordo no caso <strong>${p.caseTitle}</strong>.</p>
       ${p.reason ? `<p><strong>Motivo:</strong> ${p.reason}</p>` : ''}`,
    ),
  }),

  /**
   * Convite para ocupar um assento numa organização — diferente de
   * `referralInvite`, que traz gente nova para a plataforma. Aqui o convidado
   * pode já ter conta, e o link leva ao aceite, não ao cadastro.
   */
  organizationInvite: (p: {
    organizationName: string
    inviterName: string
    roleLabel: string
    inviteUrl: string
  }): EmailContent => ({
    subject: `Convite para ${p.organizationName} — LexLaboral`,
    html: baseLayout(
      'Você foi convidado',
      `<p style="color:#6b7280;margin-top:0">Olá!</p>
       <p><strong>${p.inviterName}</strong> convidou você para
         <strong>${p.organizationName}</strong> como <strong>${p.roleLabel}</strong>.</p>
       <p style="margin:24px 0">
         <a href="${p.inviteUrl}" style="background:#7e14ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
           Aceitar convite
         </a>
       </p>
       <p style="font-size:13px;color:#9ca3af">O convite expira em 7 dias e vale apenas para este e-mail.</p>`,
    ),
  }),

  referralInvite: (p: {
    referrerName: string
    inviteUrl: string
  }): EmailContent => ({
    subject: `${p.referrerName} convidou você para o LexLaboral`,
    html: baseLayout(
      'Você foi convidado',
      `<p style="color:#6b7280;margin-top:0">Olá!</p>
       <p><strong>${p.referrerName}</strong> usa o LexLaboral para cálculos trabalhistas e gestão de casos, e convidou você para conhecer.</p>
       <p>Entrando por este convite, você recebe de volta o valor da sua primeira mensalidade em crédito.</p>
       <p style="margin:24px 0">
         <a href="${p.inviteUrl}" style="background:#7e14ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
           Criar minha conta
         </a>
       </p>`,
    ),
  }),

  referralCashbackPaid: (p: {
    refereeName: string
    amountLabel: string
  }): EmailContent => ({
    subject: 'Seu cashback caiu — LexLaboral',
    html: baseLayout(
      'Cashback creditado',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.refereeName}!</p>
       <p>Você entrou por indicação e completou 30 dias com a gente. Creditamos <strong>${p.amountLabel}</strong> na sua conta — o valor da sua primeira mensalidade.</p>
       <p>O crédito é abatido automaticamente da sua próxima fatura.</p>`,
    ),
  }),

  referralTierUp: (p: {
    referrerName: string
    tierLabel: string
    percentOff: number
    qualifiedCount: number
  }): EmailContent => ({
    subject: `Você chegou ao nível ${p.tierLabel} — LexLaboral`,
    html: baseLayout(
      `Nível ${p.tierLabel} desbloqueado`,
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.referrerName}!</p>
       <p>Você tem <strong>${p.qualifiedCount}</strong> indicação(ões) ativa(s) e subiu para o nível <strong>${p.tierLabel}</strong>.</p>
       <p>Seu desconto agora é de <strong>${p.percentOff}%</strong> na mensalidade, aplicado a partir da próxima fatura.</p>`,
    ),
  }),

  onboardingNudgeD1: (p: {
    userName: string
    stepTitle: string
    stepUrl: string
    unsubscribeUrl: string
  }): EmailContent => ({
    subject: 'Seu primeiro cálculo leva 3 minutos — LexLaboral',
    html: baseLayout(
      'Vamos começar pelo mais importante',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.userName}!</p>
       <p>Você criou sua conta no LexLaboral ontem. O caminho mais curto para ver o sistema trabalhando é fazer uma liquidação — leva cerca de três minutos.</p>
       <p>Seu próximo passo é: <strong>${p.stepTitle}</strong>.</p>
       <p><a href="${p.stepUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px">${p.stepTitle}</a></p>
       <p style="font-size:12px;color:#9ca3af;margin-top:24px">
         Não quer mais estes e-mails? <a href="${p.unsubscribeUrl}" style="color:#9ca3af">Descadastre-se aqui</a>.
       </p>`,
    ),
  }),

  onboardingNudgeD3: (p: {
    userName: string
    stepTitle: string
    stepUrl: string
    helpUrl: string
    exampleUrl: string
    unsubscribeUrl: string
  }): EmailContent => ({
    subject: 'Uma coisa que costuma ajudar — LexLaboral',
    html: baseLayout(
      'Comece vendo um caso pronto',
      `<p style="color:#6b7280;margin-top:0">Olá, ${p.userName}!</p>
       <p>Quem está começando costuma achar mais fácil ver um processo já organizado antes de montar o próprio. Deixamos um caso de exemplo pronto, com cálculo, audiência, prazo e documento.</p>
       <p><a href="${p.exampleUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px">Ver o caso de exemplo</a></p>
       <p>Quando quiser seguir com o seu, o próximo passo é <a href="${p.stepUrl}">${p.stepTitle}</a>. A <a href="${p.helpUrl}">Central de Ajuda</a> cobre cada área do sistema.</p>
       <p style="font-size:12px;color:#9ca3af;margin-top:24px">
         Não quer mais estes e-mails? <a href="${p.unsubscribeUrl}" style="color:#9ca3af">Descadastre-se aqui</a>.
       </p>`,
    ),
  }),
}
