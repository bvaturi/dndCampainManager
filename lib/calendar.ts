import {
  validateSession,
  type SessionDraft,
  type PartySession,
} from "./party-tools";
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
/** Access tokens stay in memory. A stable event ID makes retries safe after an interrupted send. */
export async function sendCalendarEvent(
  token: string,
  campaignId: string,
  draft: SessionDraft,
  request: typeof fetch = fetch,
): Promise<PartySession> {
  const d = validateSession(draft),
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  const response = await request(base + "?sendUpdates=all", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: d.id,
      summary: d.title,
      description: d.description,
      location: d.location,
      start: { dateTime: d.start + ":00", timeZone: d.timeZone },
      end: { dateTime: d.end + ":00", timeZone: d.timeZone },
      attendees: d.attendees.map((email) => ({ email })),
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
      extendedProperties: {
        private: { stormkeepCampaign: campaignId, stormkeepSession: d.id },
      },
    }),
  });
  const resolved =
    response.status === 409
      ? await request(base + "/" + d.id, { headers })
      : response;
  if (!resolved.ok) {
    const error = await resolved.json().catch(() => ({}));
    throw Error(
      error?.error?.message ||
        "Google Calendar could not send invitations. Your draft is saved; retry after checking Calendar access.",
    );
  }
  const event = await resolved.json();
  if (
    event.id !== d.id ||
    event.extendedProperties?.private?.stormkeepCampaign !== campaignId ||
    event.extendedProperties?.private?.stormkeepSession !== d.id ||
    event.status === "cancelled"
  )
    throw Error(
      "Calendar event could not be verified. Check your Google Calendar before retrying.",
    );
  const startAt = Date.parse(event.start?.dateTime),
    endAt = Date.parse(event.end?.dateTime),
    url = new URL(event.htmlLink);
  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    endAt <= startAt ||
    url.protocol !== "https:" ||
    !["www.google.com", "calendar.google.com"].includes(url.hostname)
  )
    throw Error(
      "Unexpected Calendar response. Check your Google Calendar; your draft is retained.",
    );
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    location: d.location,
    timeZone: d.timeZone,
    organizerUid: d.organizerUid,
    startAt,
    endAt,
    calendarUrl: url.href,
  };
}

import type { SessionChange } from "./party-tools";
function verifyEvent(event: any, campaignId: string, id: string) {
  if (
    event.id !== id ||
    event.extendedProperties?.private?.stormkeepCampaign !== campaignId ||
    event.extendedProperties?.private?.stormkeepSession !== id
  )
    throw Error("Calendar event could not be verified.");
}
async function calendarResult(response: Response) {
  if (!response.ok) {
    if (response.status === 412)
      throw Error(
        "This meeting changed in Google Calendar. Close and reopen Edit before trying again.",
      );
    const error = await response.json().catch(() => ({}));
    throw Error(
      error?.error?.message ||
        "Google Calendar request failed. Retry the saved change.",
    );
  }
  return response.json();
}
export async function readCalendarSession(
  token: string,
  campaignId: string,
  session: PartySession,
  request: typeof fetch = fetch,
): Promise<SessionChange> {
  const event = await calendarResult(
    await request(base + "/" + session.id, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  verifyEvent(event, campaignId, session.id);
  if (event.status === "cancelled")
    throw Error(
      "This meeting is already cancelled in Google Calendar. Use Cancel session to update the party listing.",
    );
  if (
    !event.etag ||
    !event.start?.dateTime ||
    !event.end?.dateTime ||
    event.attendeesOmitted
  )
    throw Error(
      "This Calendar event cannot be edited here. Open Google Calendar.",
    );
  const zone = event.start.timeZone || session.timeZone;
  const local = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  return {
    draft: validateSession({
      id: session.id,
      title: event.summary || session.title,
      description: event.description || "",
      location: event.location || "",
      start: local(event.start.dateTime),
      end: local(event.end.dateTime),
      timeZone: zone,
      attendees: (event.attendees || []).map((a: any) => a.email),
      organizerUid: session.organizerUid,
    }),
    etag: event.etag,
    revision: session.revision || 0,
    operationId: crypto.randomUUID().replaceAll("-", ""),
    action: "edit",
  };
}
/** The durable operation ID recovers a successful PATCH after an interrupted database save. Attendees are omitted to preserve guests and their RSVPs. */
export async function changeCalendarSession(
  token: string,
  campaignId: string,
  change: SessionChange,
  session: PartySession,
  request: typeof fetch = fetch,
): Promise<PartySession> {
  const d = validateSession(change.draft),
    url = base + "/" + d.id,
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  const response = await request(url, { headers });
  if (change.action === "cancel" && [404, 410].includes(response.status))
    return { ...session, status: "cancelled" };
  const current = await calendarResult(response);
  verifyEvent(current, campaignId, d.id);
  if (change.action === "cancel") {
    if (current.status !== "cancelled") {
      const removed = await request(url + "?sendUpdates=all", {
        method: "DELETE",
        headers: { ...headers, "If-Match": change.etag },
      });
      if (!removed.ok && ![404, 410].includes(removed.status))
        await calendarResult(removed);
    }
    return { ...session, status: "cancelled" };
  }
  if (current.status === "cancelled")
    throw Error("This meeting was cancelled in Google Calendar.");
  const event =
    current.extendedProperties?.private?.stormkeepOperation ===
    change.operationId
      ? current
      : await calendarResult(
          await request(url + "?sendUpdates=all", {
            method: "PATCH",
            headers: { ...headers, "If-Match": change.etag },
            body: JSON.stringify({
              summary: d.title,
              description: d.description,
              location: d.location,
              start: { dateTime: d.start + ":00", timeZone: d.timeZone },
              end: { dateTime: d.end + ":00", timeZone: d.timeZone },
              extendedProperties: {
                private: {
                  ...current.extendedProperties.private,
                  stormkeepOperation: change.operationId,
                },
              },
            }),
          }),
        );
  verifyEvent(event, campaignId, d.id);
  const startAt = Date.parse(event.start?.dateTime),
    endAt = Date.parse(event.end?.dateTime);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt)
    throw Error("Unexpected Calendar response. Retry the saved change.");
  return {
    ...session,
    title: d.title,
    description: d.description,
    location: d.location,
    timeZone: d.timeZone,
    startAt,
    endAt,
    status: "scheduled",
  };
}
