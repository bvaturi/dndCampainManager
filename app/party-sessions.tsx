import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Gateway, Profile } from "@/lib/gateway";
import type { Campaign, Invitation, Member } from "@/lib/campaign-types";
import {
  validateSession,
  type PartyContact,
  type PartySession,
  type SessionDraft,
  type SessionChange,
} from "@/lib/party-tools";
import { useLanguage } from "./language";
export default function PartySessions({
  gateway,
  campaign,
  user,
  dm,
  members,
  invitations,
  report,
}: {
  gateway: Gateway;
  campaign: Campaign;
  user: Profile;
  dm: boolean;
  members: Member[];
  invitations: Invitation[];
  report: (s: string) => void;
}) {
  const { localize, t, language } = useLanguage();
  const [sessions, setSessions] = useState<PartySession[]>([]),
    [contacts, setContacts] = useState<PartyContact[]>([]),
    [drafts, setDrafts] = useState<SessionDraft[]>([]),
    [editing, setEditing] = useState<SessionChange | null>(null),
    [open, setOpen] = useState(false),
    [review, setReview] = useState<SessionDraft | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now() + 86400000);
  const [title, setTitle] = useState(campaign.name + " · Session"),
    [start, setStart] = useState(tomorrow + "T19:00"),
    [end, setEnd] = useState(tomorrow + "T23:00"),
    [timeZone, setZone] = useState("Asia/Jerusalem"),
    [location, setLocation] = useState(""),
    [description, setDescription] = useState(""),
    [includePending, setIncludePending] = useState(true);
  useEffect(
    () =>
      gateway.watchSessions(campaign.id, setSessions, (e) => report(e.message)),
    [gateway, campaign.id],
  );
  useEffect(() => {
    if (!dm) {
      setContacts([]);
      setDrafts([]);
      setReview(null);
      return;
    }
    const a = gateway.watchPartyContacts(campaign.id, setContacts, (e) =>
        report(e.message),
      ),
      b = gateway.watchSessionDrafts(campaign.id, setDrafts, (e) =>
        report(e.message),
      );
    return () => {
      a();
      b();
    };
  }, [gateway, campaign.id, dm]);
  const pending = invitations.filter(
    (i) =>
      i.expiresAt > Date.now() && !members.some((m) => m.inviteId === i.id),
  );
  const missing = members.filter((m) => !contacts.some((c) => c.id === m.id));
  const recipients = [
    ...new Set([
      ...contacts
        .filter((c) => members.some((m) => m.id === c.id))
        .map((c) => c.email),
      ...(includePending ? pending.map((i) => i.email) : []),
    ]),
  ];
  async function send() {
    if (!review) return;
    setBusy(true);
    setNotice("");
    try {
      if (editing)
        await gateway.changeSession(campaign.id, { ...editing, draft: review });
      else await gateway.sendSession(campaign.id, review);
      setNotice(
        editing
          ? gateway.previewOnly
            ? "Preview session changed. No Calendar event or email was sent."
            : editing.action === "cancel"
              ? "Session cancelled. Google Calendar notified the guests."
              : "Session updated. Google Calendar notified the guests."
          : gateway.previewOnly
            ? "Preview session saved. No Calendar event or email was sent."
            : "Session scheduled. Google Calendar sent invitations to the reviewed recipients.",
      );
      setReview(null);
      setEditing(null);
      setOpen(false);
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editSession(session: PartySession, action: "edit" | "cancel") {
    setBusy(true);
    setNotice("");
    try {
      const change = await gateway.loadSession(campaign.id, session);
      const resumed = change.recovery ? change : { ...change, action };
      setEditing(resumed);
      const d = resumed.draft;
      setTitle(d.title);
      setDescription(d.description);
      setLocation(d.location);
      setStart(d.start);
      setEnd(d.end);
      setZone(d.timeZone);
      setReview(resumed.action === "cancel" || resumed.recovery ? d : null);
      setOpen(true);
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function format(ms: number, zone: string) {
    try {
      return new Intl.DateTimeFormat(language === "he" ? "he-IL" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(ms);
    } catch {
      return new Date(ms).toLocaleString();
    }
  }
  return localize(
    <section className="dm-section party-sessions">
      <div className="section-heading">
        <div>
          <h2>Sessions</h2>
          <p className="muted">
            Plan the next game. Invitations arrive through Google Calendar and
            email.
          </p>
        </div>
        {dm && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setOpen(!open);
              setEditing(null);
              setReview(null);
            }}
          >
            Schedule session
          </Button>
        )}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {dm &&
        drafts
          .filter((d) => d.organizerUid === user.uid)
          .map((d) => (
            <div key={d.id} className="panel session-card">
              <b dir="auto">{d.title}</b>
              <p className="small muted">
                Unfinished send. Resume to recover an existing Calendar event or
                retry without duplicates.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setReview(d);
                  setOpen(true);
                }}
              >
                Resume invitation
              </Button>
            </div>
          ))}
      {dm && open && !review && (
        <form
          className="panel session-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (!editing && missing.length)
                throw Error(
                  "Some party members have no verified address yet. Ask them to open this campaign first.",
                );
              setReview(
                validateSession({
                  id:
                    editing?.draft.id ||
                    crypto.randomUUID().replaceAll("-", ""),
                  title,
                  description,
                  location,
                  start,
                  end,
                  timeZone,
                  attendees: editing?.draft.attendees || recipients,
                  organizerUid: user.uid,
                }),
              );
            } catch (e) {
              report((e as Error).message);
            }
          }}
        >
          <h3>{editing ? "Edit session" : "Schedule session"}</h3>
          <div className="wallet-fields">
            <label className="field">
              Session title
              <Input
                required
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field">
              Location or meeting link
              <Input
                maxLength={300}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
            <label className="field">
              Start time
              <Input
                type="datetime-local"
                required
                dir="ltr"
                value={start}
                onChange={(e) => setStart(e.target.value.slice(0, 16))}
              />
            </label>
            <label className="field">
              End time
              <Input
                type="datetime-local"
                required
                dir="ltr"
                value={end}
                onChange={(e) => setEnd(e.target.value.slice(0, 16))}
              />
            </label>
            <label className="field">
              Time zone
              <Input
                required
                maxLength={100}
                dir="ltr"
                value={timeZone}
                onChange={(e) => setZone(e.target.value)}
              />
            </label>
            <label className="field">
              Session notes
              <textarea
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          {!editing && pending.length > 0 && (
            <label className="session-checkbox">
              <input
                type="checkbox"
                checked={includePending}
                onChange={(e) => setIncludePending(e.target.checked)}
              />
              Include invited players awaiting sign-in
            </label>
          )}
          <p className="small muted">
            {editing
              ? "The existing guest list and RSVP responses are preserved."
              : "All current party members are included. Google sends from the DM’s signed-in Google Calendar account."}
          </p>
          {!editing && missing.length > 0 && (
            <p role="alert" className="error">
              {t("Missing verified address")}:{" "}
              {missing.map((m) => m.name).join(", ")}.{" "}
              {t("Ask these members to open this campaign first.")}
            </p>
          )}
          <div className="button-row">
            <Button
              type="submit"
              disabled={
                busy || (!editing && (missing.length > 0 || !recipients.length))
              }
            >
              {editing ? "Review changes" : "Review invitations"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {dm && open && review && (
        <div className="panel session-review">
          <h3>
            {editing?.action === "cancel"
              ? "Cancel session?"
              : editing
                ? "Review changes"
                : "Review invitations"}
          </h3>
          <h4 dir="auto">{review.title}</h4>
          <p dir="ltr">
            {review.start.replace("T", " ")} → {review.end.replace("T", " ")} ·{" "}
            {review.timeZone}
          </p>
          <p dir="auto">{review.location}</p>
          <p className="preserve-lines" dir="auto">
            {review.description}
          </p>
          <p>
            {editing
              ? "Google Calendar will notify the existing guests:"
              : "Send Google Calendar and email invitations to:"}
          </p>
          <ul>
            {review.attendees.map((email) => (
              <li key={email}>
                <bdi>{email}</bdi>
              </li>
            ))}
          </ul>
          <p className="small muted">
            Google will request Calendar permission. Guests can RSVP in their
            invitation email.
          </p>
          <div className="button-row">
            <Button disabled={busy} onClick={() => void send()}>
              {busy
                ? "Sending…"
                : editing?.action === "cancel"
                  ? "Cancel session & notify guests"
                  : editing
                    ? "Save changes & notify guests"
                    : "Send Calendar invitations"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      )}
      {sessions.length === 0 ? (
        <p className="muted">No sessions scheduled yet.</p>
      ) : (
        <div className="session-list">
          {sessions.map((s) => (
            <article className="panel session-card" key={s.id}>
              <div>
                <h3 dir="auto">{s.title}</h3>
                <p>
                  <bdi>
                    {format(s.startAt, s.timeZone)} →{" "}
                    {format(s.endAt, s.timeZone)}
                  </bdi>
                </p>
                <small dir="ltr">{s.timeZone}</small>
                {s.location && <p dir="auto">{s.location}</p>}
                {s.description && (
                  <p dir="auto" className="preserve-lines">
                    {s.description}
                  </p>
                )}
                <p className="small muted">
                  {s.status === "cancelled"
                    ? "Cancelled"
                    : "Check Google Calendar for RSVP and any changes made outside Stormkeep."}
                </p>
              </div>
              {dm &&
                s.organizerUid === user.uid &&
                s.status !== "cancelled" && (
                  <div className="button-row">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void editSession(s, "edit")}
                    >
                      Edit session
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void editSession(s, "cancel")}
                    >
                      Cancel session
                    </Button>
                  </div>
                )}
              <a href={s.calendarUrl} target="_blank" rel="noopener noreferrer">
                Open in Google Calendar ↗
              </a>
            </article>
          ))}
        </div>
      )}
    </section>,
  );
}
