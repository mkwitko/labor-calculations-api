import { prisma } from 'prisma/prisma'
import {
  getDeadlineKindLabel,
  getHearingKindLabel,
} from '@/services/labels/case-labels'
import { getValidGoogleAccessToken } from './google-oauth'

type CalendarEvent = {
  summary: string
  description?: string
  start: Date
  end: Date
  location?: string
}

// Builds a multi-line event description from labelled key/value pairs,
// skipping empty values.
function buildDescription(
  fields: Array<[string, string | null | undefined]>,
): string | undefined {
  const lines = fields
    .filter(([, value]) => value != null && value !== '')
    .map(([label, value]) => `${label}: ${value}`)
  return lines.length ? lines.join('\n') : undefined
}

function eventsUrl(calendarId: string, eventId?: string): string {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events`
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base
}

// Creates or updates a Google Calendar event for a user. Returns the event id,
// or null if the user has no integration / call fails (best-effort).
export async function upsertGoogleEvent(
  userId: string,
  event: CalendarEvent,
  existingEventId?: string | null,
): Promise<string | null> {
  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  })
  if (!integration) return null

  const token = await getValidGoogleAccessToken(userId)
  if (!token) return null

  const body = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
  }

  const res = await fetch(
    eventsUrl(integration.calendarId, existingEventId ?? undefined),
    {
      method: existingEventId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) return null
  const json = (await res.json()) as { id?: string }
  return json.id ?? null
}

export type ExternalGoogleEvent = {
  googleEventId: string
  title: string
  description: string | null
  location: string | null
  startsAt: string
  endsAt: string | null
  allDay: boolean
}

// Lists the user's Google Calendar events in a time window. Expands recurring
// events (singleEvents) and skips cancelled ones. Returns [] when the user has
// no integration or the call fails (best-effort, non-throwing).
export async function listGoogleEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<ExternalGoogleEvent[]> {
  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  })
  if (!integration) return []

  const token = await getValidGoogleAccessToken(userId)
  if (!token) return []

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      integration.calendarId,
    )}/events`,
  )
  url.searchParams.set('timeMin', timeMin.toISOString())
  url.searchParams.set('timeMax', timeMax.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []

  const json = (await res.json()) as {
    items?: Array<{
      id?: string
      status?: string
      summary?: string
      description?: string
      location?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }>
  }

  const events: ExternalGoogleEvent[] = []
  for (const item of json.items ?? []) {
    if (!item.id || item.status === 'cancelled') continue
    const startsAt = item.start?.dateTime ?? item.start?.date
    if (!startsAt) continue
    const allDay = !item.start?.dateTime
    events.push({
      googleEventId: item.id,
      title: item.summary ?? '(sem título)',
      description: item.description ?? null,
      location: item.location ?? null,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: item.end?.dateTime
        ? new Date(item.end.dateTime).toISOString()
        : null,
      allDay,
    })
  }
  return events
}

export async function deleteGoogleEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  })
  if (!integration) return
  const token = await getValidGoogleAccessToken(userId)
  if (!token) return
  await fetch(eventsUrl(integration.calendarId, eventId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined)
}

// Best-effort sync of a hearing to Google Calendar. Non-blocking; logs errors.
export async function syncHearingToGoogle(hearingId: string): Promise<void> {
  try {
    const hearing = await prisma.hearing.findUnique({
      where: { id: hearingId },
      include: {
        case: {
          select: {
            assignedToId: true,
            title: true,
            processNumber: true,
            client: { select: { name: true } },
          },
        },
      },
    })
    if (!hearing) return
    const integration = await prisma.googleIntegration.findUnique({
      where: { userId: hearing.case.assignedToId },
    })
    if (!integration?.syncHearings) return

    const kindLabel = getHearingKindLabel(hearing.kind)
    const start = hearing.scheduledAt
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const eventId = await upsertGoogleEvent(
      hearing.case.assignedToId,
      {
        summary: `${kindLabel} — ${hearing.case.title}`,
        description: buildDescription([
          ['Tipo', kindLabel],
          ['Cliente', hearing.case.client?.name],
          ['Caso', hearing.case.title],
          ['Processo', hearing.case.processNumber],
          ['Local', hearing.location],
          ['Link', hearing.link],
          ['Observações', hearing.notes],
        ]),
        location: hearing.location ?? undefined,
        start,
        end,
      },
      hearing.googleEventId,
    )
    if (eventId && eventId !== hearing.googleEventId) {
      await prisma.hearing.update({
        where: { id: hearingId },
        data: { googleEventId: eventId },
      })
    }
  } catch (err) {
    console.error('syncHearingToGoogle failed', { error: err })
  }
}

// Best-effort sync of a deadline to Google Calendar (all-day-ish, 30 min slot).
export async function syncDeadlineToGoogle(deadlineId: string): Promise<void> {
  try {
    const deadline = await prisma.deadline.findUnique({
      where: { id: deadlineId },
      include: {
        case: {
          select: {
            assignedToId: true,
            title: true,
            processNumber: true,
            client: { select: { name: true } },
          },
        },
      },
    })
    if (!deadline) return
    const integration = await prisma.googleIntegration.findUnique({
      where: { userId: deadline.case.assignedToId },
    })
    if (!integration?.syncDeadlines) return

    const kindLabel = getDeadlineKindLabel(deadline.kind, deadline.customLabel)
    const start = deadline.dueAt
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    const eventId = await upsertGoogleEvent(
      deadline.case.assignedToId,
      {
        summary: `${kindLabel} — ${deadline.case.title}`,
        description: buildDescription([
          ['Tipo', kindLabel],
          ['Cliente', deadline.case.client?.name],
          ['Caso', deadline.case.title],
          ['Processo', deadline.case.processNumber],
        ]),
        start,
        end,
      },
      deadline.googleEventId,
    )
    if (eventId && eventId !== deadline.googleEventId) {
      await prisma.deadline.update({
        where: { id: deadlineId },
        data: { googleEventId: eventId },
      })
    }
  } catch (err) {
    console.error('syncDeadlineToGoogle failed', { error: err })
  }
}
