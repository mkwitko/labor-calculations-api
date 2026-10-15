import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  ENV: z.enum(['development', 'staging', 'production', 'test']),
  DATABASE_URL: z.string(),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  CLIENT_URL: z.string(),
  SENTRY_DSN: z.string().optional(),
  ADMIN_ENCRYPTION_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_ID_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_YEARLY: z.string().optional(),
  STRIPE_PRICE_ID_API: z.string().optional(),
  STRIPE_API_METER_EVENT: z.string().default('jurispro_api_calculation'),
  STRIPE_TRIAL_DAYS: z.coerce.number().optional(),
  // Signing secret of the Stripe webhook endpoint. Without it the webhook
  // route rejects every request — get it from `stripe listen` in development
  // or from the endpoint's settings in the dashboard.
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // External request logging (Axiom). When both are set, every request is
  // shipped as a structured log with a trace id.
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  SWAGGER_FRONT_DIR: z.string().optional(),
  FGTS_RATE: z.coerce.number(),
  MINIMUM_WAGE: z.coerce.number(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().default('noreply@example.com'),
  /// Caixa que recebe chamado novo e resposta de escritório. Tem default para
  /// o canal não depender de uma variável a mais no deploy.
  SUPPORT_EMAIL: z.string().default('support@example.com'),
  /// clamd para varrer anexo do suporte. Sem host, o anexo é gravado com
  /// `scanStatus: skipped` — declarar que não houve varredura, em vez de fingir
  /// que houve. Ver `services/support/support-attachment.ts`.
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().default(3310),
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  // DataJud (CNJ) public API. The default key below is the public key
  // published by the CNJ for the API Pública; override via env if needed.
  DATAJUD_API_KEY: z
    .string()
    .default('cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='),
  DATAJUD_BASE_URL: z
    .string()
    .default('https://api-publica.datajud.cnj.jus.br'),
  // Google Calendar OAuth (optional — integration is disabled if unset).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
})

export const env = envSchema.parse(process.env)
