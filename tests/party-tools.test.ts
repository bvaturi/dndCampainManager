import { describe, it, expect, vi } from "vitest";
import {
  emptyCombat,
  nextTurn,
  sortInitiative,
  validateCombat,
  validateSession,
  type SessionDraft,
} from "../lib/party-tools";
import { sendCalendarEvent } from "../lib/calendar";
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
