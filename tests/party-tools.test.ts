import { describe, it, expect, vi } from "vitest";
import {
  emptyCombat,
  nextTurn,
  sortInitiative,
  validateCombat,
  validateSession,
  type SessionDraft,
} from "../lib/party-tools";
import {
  sendCalendarEvent,
  changeCalendarSession,
  readCalendarSession,
} from "../lib/calendar";
const draft: SessionDraft = {
  id: "a".repeat(32),
  title: "Next game",
  description: "Bring dice",
  location: "Table",
  start: "2026-10-20T19:00",
  end: "2026-10-20T23:00",
  timeZone: "Asia/Jerusalem",
  attendees: ["player@example.test"],
  organizerUid: "dm",
};
const event = {
  id: draft.id,
  htmlLink: "https://www.google.com/calendar/event?eid=example",
  start: { dateTime: "2026-10-20T19:00:00+03:00" },
  end: { dateTime: "2026-10-20T23:00:00+03:00" },
  extendedProperties: {
    private: { stormkeepCampaign: "campaign", stormkeepSession: draft.id },
  },
};
describe("party tools", () => {
  it("orders initiative, resolves ties and wraps rounds", () => {
    const c = {
      ...emptyCombat(),
      entries: [
        { id: "a", name: "A", initiative: 12, order: 1, conditions: "" },
        { id: "b", name: "B", initiative: 18, order: 2, conditions: "" },
        { id: "c", name: "C", initiative: 12, order: 0, conditions: "" },
      ],
    };
    expect(sortInitiative(c.entries).map((e) => e.id)).toEqual(["b", "c", "a"]);
    const first = nextTurn(c);
    expect(first.activeId).toBe("b");
    expect(first.round).toBe(1);
    expect(nextTurn({ ...c, activeId: "a" })).toMatchObject({
      activeId: "b",
      round: 2,
    });
  });
  it("handles an empty order and rejects duplicate entries or an invalid active turn", () => {
    expect(nextTurn(emptyCombat())).toEqual(emptyCombat());
    expect(() =>
      validateCombat({ ...emptyCombat(), activeId: "missing" }),
    ).toThrow();
    const entry = {
      id: "a",
      name: "A",
      initiative: 12,
      order: 1,
      conditions: "",
    };
    expect(() =>
      validateCombat({ ...emptyCombat(), entries: [entry, entry] }),
    ).toThrow();
  });
  it("validates dates, time zones and deduplicates emails", () => {
    expect(
      validateSession({
        ...draft,
        attendees: ["PLAYER@example.test", "player@example.test"],
      }).attendees,
    ).toEqual(["player@example.test"]);
    expect(() => validateSession({ ...draft, end: draft.start })).toThrow();
    expect(() =>
      validateSession({ ...draft, start: "2026-02-30T19:00" }),
    ).toThrow();
    expect(() =>
      validateSession({ ...draft, timeZone: "Invalid/Zone" }),
    ).toThrow();
  });
  it("creates an event with explicit zone and sends updates to all attendees", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(event), { status: 200 }));
    const result = await sendCalendarEvent(
      "secret",
      "campaign",
      draft,
      request,
    );
    expect(result.startAt).toBe(Date.parse(event.start.dateTime));
    const [url, options] = request.mock.calls[0];
    expect(url).toContain("sendUpdates=all");
    const body = JSON.parse(options.body);
    expect(body.attendees).toEqual([{ email: "player@example.test" }]);
    expect(body.start).toEqual({
      dateTime: "2026-10-20T19:00:00",
      timeZone: "Asia/Jerusalem",
    });
    expect(body.guestsCanSeeOtherGuests).toBe(false);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("recovers a duplicate event ID using GET instead of sending a second event", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(event), { status: 200 }),
      );
    await sendCalendarEvent("secret", "campaign", draft, request);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("/" + draft.id);
    expect(request.mock.calls[1][1].method).toBeUndefined();
  });
  it("does not claim success after a denied Calendar request", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Permission denied" } }),
          { status: 403 },
        ),
      );
    await expect(
      sendCalendarEvent("secret", "campaign", draft, request),
    ).rejects.toThrow("Permission denied");
  });
  it("rejects recovery of a different or cancelled Calendar event", async () => {
    for (const result of [
      { ...event, extendedProperties: {} },
      { ...event, status: "cancelled" },
    ])
      await expect(
        sendCalendarEvent(
          "secret",
          "campaign",
          draft,
          vi
            .fn()
            .mockResolvedValue(
              new Response(JSON.stringify(result), { status: 200 }),
            ),
        ),
      ).rejects.toThrow("could not be verified");
  });
});

describe("Calendar session changes", () => {
  const change = {
    draft,
    etag: '"old"',
    revision: 0,
    operationId: "b".repeat(32),
    action: "edit" as const,
  };
  const current = {
    ...event,
    etag: '"old"',
    attendees: [{ email: "player@example.test", responseStatus: "accepted" }],
  };
  const session = {
    id: draft.id,
    title: draft.title,
    description: draft.description,
    location: draft.location,
    timeZone: draft.timeZone,
    organizerUid: draft.organizerUid,
    startAt: Date.parse(event.start.dateTime),
    endAt: Date.parse(event.end.dateTime),
    calendarUrl: event.htmlLink,
  };
  it("patches the same event with an ETag and notifies all guests without overwriting RSVPs", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(current)))
      .mockResolvedValueOnce(new Response(JSON.stringify(event)));
    await changeCalendarSession("secret", "campaign", change, session, request);
    const [url, options] = request.mock.calls[1];
    expect(url).toContain("/" + draft.id + "?sendUpdates=all");
    expect(options.method).toBe("PATCH");
    expect(options.headers["If-Match"]).toBe('"old"');
    expect(JSON.parse(options.body).attendees).toBeUndefined();
  });
  it("recovers an applied operation without sending another notification", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ...current,
            extendedProperties: {
              private: {
                ...event.extendedProperties.private,
                stormkeepOperation: change.operationId,
              },
            },
          }),
        ),
      );
    await changeCalendarSession("secret", "campaign", change, session, request);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("cancels the existing event with guest notifications and recovers an already deleted event", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(current)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(
      await changeCalendarSession(
        "secret",
        "campaign",
        { ...change, action: "cancel" },
        session,
        request,
      ),
    ).toMatchObject({ status: "cancelled" });
    expect(request.mock.calls[1][1].method).toBe("DELETE");
    expect(request.mock.calls[1][0]).toContain("sendUpdates=all");
    const retry = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 410 }));
    expect(
      await changeCalendarSession(
        "secret",
        "campaign",
        { ...change, action: "cancel" },
        session,
        retry,
      ),
    ).toMatchObject({ status: "cancelled" });
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("refuses concurrent changes and unrelated events", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(current)))
      .mockResolvedValueOnce(new Response("{}", { status: 412 }));
    await expect(
      changeCalendarSession("secret", "campaign", change, session, request),
    ).rejects.toThrow("changed in Google Calendar");
    await expect(
      changeCalendarSession(
        "secret",
        "other",
        change,
        session,
        vi.fn().mockResolvedValue(new Response(JSON.stringify(current))),
      ),
    ).rejects.toThrow("could not be verified");
  });
  it("loads current Calendar details in the event timezone", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ...current,
            summary: "Edited in Calendar",
            start: { ...event.start, timeZone: "Asia/Jerusalem" },
          }),
        ),
      );
    const loaded = await readCalendarSession(
      "secret",
      "campaign",
      session,
      request,
    );
    expect(loaded.draft.start).toBe(draft.start);
    expect(loaded.draft.title).toBe("Edited in Calendar");
    expect(loaded.draft.attendees).toEqual(draft.attendees);
    expect(loaded.etag).toBe('"old"');
  });
});
