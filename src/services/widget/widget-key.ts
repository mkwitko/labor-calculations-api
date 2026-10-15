import { randomBytes } from 'node:crypto'
import { systemPrisma } from 'prisma/prisma'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'

/**
 * A chave do widget vive no HTML do site do escritório: qualquer visitante a
 * lê. Ela não autoriza nada além de "atribua este cálculo a esta organização",
 * e por isso é guardada em claro e pode ser rotacionada — diferente de um
 * token de acesso, que é hasheado.
 *
 * Vinte e quatro bytes em base64url dão 32 caracteres, curtos o bastante para
 * caber numa linha de snippet e longos o bastante para não serem sorteados.
 */
function generateWidgetKey(): string {
  return randomBytes(24).toString('base64url')
}

export type WidgetBranding = {
  organizationId: string
  officeName: string
  logoUrl: string | null
  brandPrimaryColor: string | null
}

/**
 * Liga o widget ou troca a chave. Rotacionar invalida o snippet já colado —
 * quem chama avisa disso na tela, porque o efeito é o widget parar de atribuir
 * até o código ser trocado.
 */
export async function issueWidgetKey(organizationId: string): Promise<string> {
  const widgetKey = generateWidgetKey()

  await systemPrisma.organization.update({
    where: { id: organizationId },
    data: { widgetKey },
  })

  return widgetKey
}

/** Desliga o widget. Cálculos já atribuídos continuam na lista da organização. */
export async function revokeWidgetKey(organizationId: string): Promise<void> {
  await systemPrisma.organization.update({
    where: { id: organizationId },
    data: { widgetKey: null },
  })
}

export async function getWidgetKey(
  organizationId: string,
): Promise<string | null> {
  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: { widgetKey: true },
  })

  return organization?.widgetKey ?? null
}

/**
 * Resolve a chave que chega de fora. Organização apagada não vale: o widget
 * continuaria vivo no site de terceiro depois de a conta sumir.
 */
export async function resolveWidgetBranding(
  widgetKey: string,
): Promise<WidgetBranding> {
  const organization = await systemPrisma.organization.findFirst({
    where: { widgetKey, deletedAt: null },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      brandPrimaryColor: true,
    },
  })

  if (!organization) {
    throw new ResourceNotFoundException('Widget não encontrado')
  }

  return {
    organizationId: organization.id,
    officeName: organization.name,
    logoUrl: organization.logoUrl,
    brandPrimaryColor: organization.brandPrimaryColor,
  }
}
