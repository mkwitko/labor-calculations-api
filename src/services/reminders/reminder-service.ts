import { systemPrisma as prisma } from 'prisma/prisma'
import { sendEmail } from '@/services/email'
import {
  DEADLINE_KIND_LABELS,
  HEARING_KIND_LABELS,
} from '@/services/labels/case-labels'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

type ReminderItem = {
  label: string
  caseTitle: string
  at: Date
}

async function collectReminders(
  targetDate: Date,
): Promise<Map<string, { mail: string; name: string; items: ReminderItem[] }>> {
  const start = startOfDay(targetDate)
  const end = endOfDay(targetDate)

  const [hearings, deadlines, agendaEvents] = await Promise.all([
    prisma.hearing.findMany({
      where: { scheduledAt: { gte: start, lte: end } },
      select: {
        scheduledAt: true,
        kind: true,
        case: {
          select: {
            title: true,
            assignedTo: {
              select: {
                id: true,
                mail: true,
                name: true,
                remindD3: true,
                remindD1: true,
              },
            },
          },
        },
      },
    }),
    prisma.deadline.findMany({
      where: { dueAt: { gte: start, lte: end }, doneAt: null },
      select: {
        dueAt: true,
        kind: true,
        customLabel: true,
        case: {
          select: {
            title: true,
            assignedTo: {
              select: {
                id: true,
                mail: true,
                name: true,
                remindD3: true,
                remindD1: true,
              },
            },
          },
        },
      },
    }),
    prisma.agendaEvent.findMany({
      where: {
        startsAt: { gte: start, lte: end },
        doneAt: null,
        remindEmail: true,
      },
      select: {
        title: true,
        location: true,
        startsAt: true,
        user: { select: { id: true, mail: true, name: true } },
      },
    }),
  ])

  const byUser = new Map<
    string,
    { mail: string; name: string; items: ReminderItem[] }
  >()

  for (const h of hearings) {
    const user = h.case.assignedTo
    if (!byUser.has(user.id))
      byUser.set(user.id, { mail: user.mail, name: user.name, items: [] })
    byUser.get(user.id)!.items.push({
      label: HEARING_KIND_LABELS[h.kind] ?? 'Audiência',
      caseTitle: h.case.title,
      at: h.scheduledAt,
    })
  }

  for (const d of deadlines) {
    const user = d.case.assignedTo
    if (!byUser.has(user.id))
      byUser.set(user.id, { mail: user.mail, name: user.name, items: [] })
    const label = d.customLabel ?? DEADLINE_KIND_LABELS[d.kind] ?? 'Prazo'
    byUser.get(user.id)!.items.push({
      label,
      caseTitle: d.case.title,
      at: d.dueAt,
    })
  }

  for (const e of agendaEvents) {
    const user = e.user
    if (!byUser.has(user.id))
      byUser.set(user.id, { mail: user.mail, name: user.name, items: [] })
    byUser.get(user.id)!.items.push({
      label: e.title,
      caseTitle: e.location ?? 'Evento da agenda',
      at: e.startsAt,
    })
  }

  return byUser
}

function buildEmailHtml(
  name: string,
  items: ReminderItem[],
  daysLabel: string,
): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb">
            <strong>${item.label}</strong><br/>
            <span style="color:#6b7280;font-size:14px">${item.caseTitle}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">
            ${formatDate(item.at)}
          </td>
        </tr>`,
    )
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <h2 style="margin-bottom:4px">Lembrete — ${daysLabel}</h2>
      <p style="color:#6b7280;margin-top:0">Olá, ${name}! Você tem os seguintes eventos chegando:</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin-top:24px;font-size:13px;color:#9ca3af">
        Você pode gerenciar suas preferências de lembretes em Configurações → Lembretes.
      </p>
    </div>
  `
}

async function sendReminderEmails(
  users: Map<string, { mail: string; name: string; items: ReminderItem[] }>,
  daysLabel: string,
): Promise<void> {
  const sends = Array.from(users.values()).map(({ mail, name, items }) =>
    sendEmail({
      to: mail,
      subject: `LexLaboral — Lembrete ${daysLabel}`,
      html: buildEmailHtml(name, items, daysLabel),
    }).catch((err) => {
      console.error('Failed to send reminder email', {
        mail,
        error: err,
      })
    }),
  )

  await Promise.all(sends)
}

export async function runDailyReminders(): Promise<void> {
  const now = new Date()

  const d3target = addDays(now, 3)
  const d1target = addDays(now, 1)

  const [d3users, d1users] = await Promise.all([
    collectReminders(d3target),
    collectReminders(d1target),
  ])

  const d3filtered = new Map(
    Array.from(d3users.entries()).filter(([, entry]) => entry.items.length > 0),
  )

  const d1filtered = new Map(
    Array.from(d1users.entries()).filter(([, entry]) => entry.items.length > 0),
  )

  await Promise.all([
    sendReminderEmails(d3filtered, 'D-3'),
    sendReminderEmails(d1filtered, 'D-1'),
  ])

  console.log('Daily reminders sent', {
    d3: d3filtered.size,
    d1: d1filtered.size,
    timestamp: now.toISOString(),
  })
}
