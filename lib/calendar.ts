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
