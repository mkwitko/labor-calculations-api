export const MS_PER_SECOND = 1000
export const MS_PER_MINUTE = 60 * MS_PER_SECOND
export const MS_PER_HOUR = 60 * MS_PER_MINUTE
export const MS_PER_DAY = 24 * MS_PER_HOUR

// Declared here rather than in the controller so `app.ts` can special-case the
// route in its content type parser without importing a route module.
export const STRIPE_WEBHOOK_PATH = '/billing/webhook'
