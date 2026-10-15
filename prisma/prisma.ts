import { PrismaClient } from "@prisma/client";
import { env } from "@/env";
import { handlePrismaError } from "@/http/exceptions/handler/prisma-error-handler";
import { PrismaException } from "@/http/exceptions/prisma-exception";
import { TenantContextMissingException } from "@/http/exceptions/tenant-context-missing-exception";
import { currentOrganizationId } from "@/lib/tenant-context";
import { isTenantModel } from "@/lib/tenant-models";
import { withOrganizationScope } from "@/lib/tenant-scope";

const prismaClient = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
});

const withErrorHandling = prismaClient.$extends({
  query: {
    $allModels: {
      async $allOperations<Args, Result, Name extends string>({
        args,
        query,
      }: {
        args: Args;
        query: (args: Args) => Promise<Result>;
      }): Promise<Result> {
        if (env.ENV === "test") {
          return query(args);
        }
        try {
          return await query(args);
        } catch (error: unknown) {
          console.error({ error });
          const errorMessage = handlePrismaError(error);
          throw new PrismaException(errorMessage);
        }
      },
    },
  },
});

/**
 * Client sem escopo de organização. Use apenas em contexto de sistema:
 * webhook do Stripe, cron, seed e testes. Toda outra chamada usa `prisma`.
 */
export const systemPrisma = withErrorHandling;

/**
 * `$allModels.$allOperations` never sees raw queries — Prisma looks them up
 * under a separate top-level key in the query component, not under
 * `$allModels`. Without this, `$queryRaw`/`$executeRaw` (and their unsafe
 * counterparts) would reach the database on the scoped client with no
 * organization filter at all, silently. There is no model name at this
 * level to consult `isTenantModel` with, so the only fail-closed option is
 * an unconditional throw pointing the caller at `systemPrisma`.
 */
function forbidRawOnScopedClient(operation: string): never {
  throw new Error(
    `Operação raw "${operation}" não é permitida no client com escopo de ` +
      "organização: não há como filtrar por organizationId numa query raw. " +
      "Use systemPrisma.",
  );
}

const withTenantScope = withErrorHandling.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!isTenantModel(model)) {
          return query(args);
        }

        const organizationId = currentOrganizationId();

        if (!organizationId) {
          throw new TenantContextMissingException(
            model ?? "unknown",
            operation,
          );
        }

        return query(
          withOrganizationScope(args, operation, organizationId) as never,
        );
      },
    },
    async $queryRaw() {
      forbidRawOnScopedClient("$queryRaw");
    },
    async $executeRaw() {
      forbidRawOnScopedClient("$executeRaw");
    },
    async $queryRawUnsafe() {
      forbidRawOnScopedClient("$queryRawUnsafe");
    },
    async $executeRawUnsafe() {
      forbidRawOnScopedClient("$executeRawUnsafe");
    },
  },
});

export const prisma = withTenantScope;

export type PrismaTransactionClient = Omit<
  typeof withTenantScope,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
