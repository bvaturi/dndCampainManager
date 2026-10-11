import { z } from "zod";
const key = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const initiativeEntrySchema = z
  .object({
    id: key,
    name: z.string().trim().min(1).max(100),
    initiative: z.number().int().min(-30).max(100),
    order: z.number().int().min(0).max(1000),
    conditions: z.string().max(200),
  })
  .strict();
export type InitiativeEntry = z.infer<typeof initiativeEntrySchema>;
export interface Combat {
  entries: InitiativeEntry[];
  activeId: string;
  round: number;
  revision: number;
}
export const emptyCombat = (): Combat => ({
  entries: [],
  activeId: "",
  round: 1,
  revision: 0,
});
export const sortInitiative = (entries: InitiativeEntry[]) =>
  [...entries].sort(
    (a, b) =>
      b.initiative - a.initiative ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
export function nextTurn(combat: Combat): Combat {
  const entries = sortInitiative(combat.entries);
  if (!entries.length) return combat;
  const current = entries.findIndex((e) => e.id === combat.activeId),
    next = (current + 1) % entries.length;
  return {
    ...combat,
    activeId: entries[next].id,
    round:
      current >= 0 && next === 0
        ? Math.min(9999, combat.round + 1)
        : combat.round,
  };
}
export function validateCombat(combat: Combat) {
  z.object({
    entries: z.array(initiativeEntrySchema).max(40),
    activeId: z.string().max(100),
    round: z.number().int().min(1).max(9999),
    revision: z.number().int().min(0).max(100000000),
  })
    .strict()
    .parse(combat);
  if (
    new Set(combat.entries.map((e) => e.id)).size !== combat.entries.length ||
    (combat.activeId && !combat.entries.some((e) => e.id === combat.activeId))
  )
    throw Error("Invalid initiative order");
  return combat;
}
export interface PartyContact {
  id: string;
  name: string;
  email: string;
}
export const sessionDraftSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    title: z.string().trim().min(1).max(150),
    description: z.string().max(2000),
    location: z.string().max(300),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    timeZone: z.string().min(1).max(100),
    attendees: z.array(z.string().email().max(254)).min(1).max(50),
    organizerUid: z.string().min(1).max(128),
  })
  .strict();
export type SessionDraft = z.infer<typeof sessionDraftSchema>;
export interface SessionChange {
  recovery?: boolean;
  draft: SessionDraft;
  etag: string;
  revision: number;
  operationId: string;
  action: "edit" | "cancel";
}
export interface PartySession {
  revision?: number;
  status?: "scheduled" | "cancelled";
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
  timeZone: string;
  calendarUrl: string;
  organizerUid: string;
}
export function validateSession(draft: SessionDraft) {
  const parsed = sessionDraftSchema.safeParse(draft);
  if (!parsed.success)
    throw Error("Check the session title, date, time and recipient emails.");
  const d = parsed.data;
  if (d.end <= d.start) throw Error("End time must be after start time");
  for (const value of [d.start, d.end]) {
    const date = new Date(value + "Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 16) !== value
    )
      throw Error("Invalid session date");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.timeZone });
  } catch {
    throw Error("Invalid time zone");
  }
  return {
    ...d,
    attendees: [...new Set(d.attendees.map((e) => e.trim().toLowerCase()))],
  };
}
