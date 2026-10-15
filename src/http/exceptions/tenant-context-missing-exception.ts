/**
 * Modelo tenant consultado fora de um contexto de organização. Falha fechada:
 * é preferível derrubar o request a devolver dados sem filtro.
 */
export class TenantContextMissingException extends Error {
  public readonly statusCode = 500

  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} foi chamado sem contexto de organização. ` +
        'Em webhook, cron ou seed, use systemPrisma; em request, garanta que ' +
        'a rota passa pelo hook de autenticação.',
    )
    this.name = 'TenantContextMissingException'
  }
}
