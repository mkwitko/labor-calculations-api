import '@/instrument'
import * as Sentry from '@sentry/node'
import cronImport from 'node-cron'
import { app } from '@/app'
import { env } from '@/env'
import { reportPendingApiUsage } from '@/services/api/report-api-usage'
import { reconcileExtraMembers } from '@/services/billing/sync-extra-members'
import { runCaseMovementSync } from '@/services/datajud/sync-case-movements'
import { purgeDeletedDocuments } from '@/services/documents/purge-service'
import { syncMonetaryIndices } from '@/services/monetary-index/sync-monetary-indices'
import { sendOnboardingNudges } from '@/services/onboarding/send-onboarding-nudges'
import { purgeExpiredPublicCalculations } from '@/services/public-calculation/purge-expired-public-calculations'
import { runReferralCashback } from '@/services/referral/cashback'
import { reconcileReferrals } from '@/services/referral/reconcile'
import { runClientDocumentReminders } from '@/services/reminders/client-document-reminders'
import { runDailyReminders } from '@/services/reminders/reminder-service'
import { purgeExpiredSupportAttachments } from '@/services/support/support-attachment'

// Wrap node-cron so each scheduled job reports check-ins to Sentry Cron
// Monitors — a missed/failed run then alerts instead of dying in console.error.
const cron = Sentry.cron.instrumentNodeCron(cronImport)

app
  .listen({ port: env.PORT, host: env.HOST })
  .then(() => {
    console.log(`Server is running on ${env.HOST}:${env.PORT}`)

    // Daily at 06:00 BRT (09:00 UTC)
    cron.schedule(
      '0 9 * * *',
      () => {
        runDailyReminders().catch((err) => {
          console.error('Reminder cron failed', { error: err })
        })
        // Aviso do cliente sobre documento pendente perto do prazo. Roda no
        // mesmo horário, mas separado: falha de um não derruba o outro.
        runClientDocumentReminders().catch((err) => {
          console.error('Client document reminder cron failed', { error: err })
        })
      },
      { name: 'daily-reminders', timezone: 'UTC' },
    )

    // Diariamente às 07:00 UTC (04:00 BRT) — varre os casos ativos contra o
    // DataJud e avisa o advogado quando o processo dele andou. De madrugada
    // porque é uma varredura longa contra uma API pública com limite, e o dado
    // do CNJ é publicado com defasagem: rodar de hora em hora não traria nada.
    cron.schedule(
      '0 7 * * *',
      () => {
        runCaseMovementSync()
          .then((r) => {
            if (r.checked > 0) {
              console.log(
                `Case movement sync: ${r.checked} casos, ${r.imported} andamentos, ${r.notified} avisos, ${r.failed} falhas`,
              )
            }
          })
          .catch((err) => {
            console.error('Case movement sync cron failed', { error: err })
          })
      },
      { name: 'case-movement-sync', timezone: 'UTC' },
    )

    // Daily at 03:00 UTC — purge documents soft-deleted 30+ days ago
    cron.schedule(
      '0 3 * * *',
      () => {
        purgeDeletedDocuments().catch((err) => {
          console.error('Document purge cron failed', { error: err })
        })
      },
      { name: 'document-purge', timezone: 'UTC' },
    )

    // Daily at 05:00 UTC — reporta ao Stripe o uso da API ainda pendente.
    cron.schedule(
      '0 5 * * *',
      () => {
        reportPendingApiUsage(new Date())
          .then((r) => {
            if (r.reported > 0 || r.skipped > 0) {
              console.log(
                `API usage: ${r.reported} reportados, ${r.skipped} organizações pendentes`,
              )
            }
          })
          .catch((err) => {
            console.error('API usage cron failed', { error: err })
          })
      },
      { name: 'api-usage-report', timezone: 'UTC' },
    )

    // Daily at 04:00 UTC — release the first-month cashback to referees who
    // completed the 30-day holding period.
    cron.schedule(
      '0 4 * * *',
      () => {
        runReferralCashback()
          .then((r) => {
            if (r.eligible > 0) {
              console.log(
                `Referral cashback: ${r.paid} paid, ${r.skipped} skipped, ${r.failed} failed`,
              )
            }
          })
          .catch((err) => {
            console.error('Referral cashback cron failed', { error: err })
          })
      },
      { name: 'referral-cashback', timezone: 'UTC' },
    )

    // Weekly on Monday at 04:30 UTC — catch referrals left stale by a webhook
    // event that never arrived.
    cron.schedule(
      '30 4 * * 1',
      () => {
        reconcileReferrals()
          .then((r) => {
            console.log(
              `Referral reconcile: ${r.checked} checked, ${r.qualified} qualified, ${r.lost} lost, ${r.failed} failed`,
            )
          })
          .catch((err) => {
            console.error('Referral reconcile cron failed', { error: err })
          })
      },
      { name: 'referral-reconcile', timezone: 'UTC' },
    )

    // Daily at 04:20 UTC — syncExtraMembers never throws by design, so a call
    // lost to a Stripe outage would leave the extra-member item behind the
    // headcount until the next team change. This pass closes that gap.
    cron.schedule(
      '20 4 * * *',
      () => {
        reconcileExtraMembers()
          .then((r) => {
            console.log(
              `Extra member reconcile: ${r.checked} checked, ${r.updated} updated`,
            )
          })
          .catch((err) => {
            console.error('Extra member reconcile cron failed', { error: err })
          })
      },
      { name: 'extra-member-reconcile', timezone: 'UTC' },
    )

    // Monthly on the 16th at 05:00 UTC — IPCA-15/IPCA-E for the month is out by
    // mid-month; pull the latest official indices from Banco Central.
    cron.schedule(
      '0 5 16 * *',
      () => {
        syncMonetaryIndices()
          .then((r) => {
            console.log(
              `Monetary index sync: ${r.monthsUpserted} months (latest ${r.latestMonth}, ${r.skippedManual} manual kept)`,
            )
          })
          .catch((err) => {
            console.error('Monetary index sync cron failed', { error: err })
          })
      },
      { name: 'monetary-index-sync', timezone: 'UTC' },
    )

    // Daily at 12:00 UTC (09:00 BRT) — dois toques de retomada para quem criou
    // conta e não chegou ao primeiro resultado. Meio da manhã de propósito: é
    // quando o escritório está no computador.
    cron.schedule(
      '0 12 * * *',
      () => {
        sendOnboardingNudges()
          .then((r) => {
            if (r.d1 + r.d3 + r.skipped > 0) {
              console.log(
                `Onboarding nudges: ${r.d1} D+1, ${r.d3} D+3, ${r.skipped} skipped`,
              )
            }
          })
          .catch((err) => {
            console.error('Onboarding nudge cron failed', { error: err })
          })
      },
      { name: 'onboarding-nudge', timezone: 'UTC' },
    )

    // Daily at 04:30 UTC — cálculo público guarda contato de quem não tem conta.
    // Passados os 90 dias ele sai do banco, a não ser que já tenha virado
    // cliente de algum escritório.
    cron.schedule(
      '30 4 * * *',
      () => {
        purgeExpiredPublicCalculations()
          .then((deleted) => {
            if (deleted > 0) {
              console.log(`Public calculation purge removed ${deleted} rows`)
            }
          })
          .catch((err) => {
            console.error('Public calculation purge cron failed', {
              error: err,
            })
          })
      },
      { name: 'public-calculation-purge', timezone: 'UTC' },
    )

    // Daily at 04:45 UTC — anexo de chamado encerrado há mais de 180 dias sai
    // do bucket. A conversa fica; o print da folha de pagamento, não.
    cron.schedule(
      '45 4 * * *',
      () => {
        purgeExpiredSupportAttachments().catch((err) => {
          console.error('Support attachment purge cron failed', { error: err })
        })
      },
      { name: 'support-attachment-purge', timezone: 'UTC' },
    )

    // Run once at boot so a fresh deploy has current indices without waiting.
    syncMonetaryIndices().catch((err) => {
      console.error('Monetary index sync (startup) failed', { error: err })
    })
  })
  .catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
