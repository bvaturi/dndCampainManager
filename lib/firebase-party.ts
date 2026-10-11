import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { isPlatformAdmin } from "./access";
import type { Profile, Watch, Fail } from "./gateway";
import {
  emptyCombat,
  validateCombat,
  validateSession,
  type Combat,
  type InitiativeEntry,
  type PartyContact,
  type PartySession,
  type SessionDraft,
  type SessionChange,
} from "./party-tools";
import {
  CALENDAR_SCOPE,
  sendCalendarEvent,
  readCalendarSession,
  changeCalendarSession,
} from "./calendar";
export class FirebaseParty {
  constructor(
    private db: Firestore,
    private auth: Auth,
  ) {}
  private row(id: string, kind: string, key: string) {
    return doc(this.db, "campaigns", id, kind, key);
  }
  private rows(id: string, kind: string) {
    return collection(this.db, "campaigns", id, kind);
  }
  private uid() {
    if (!this.auth.currentUser) throw Error("Sign in first");
    return this.auth.currentUser.uid;
  }
  async renameCampaign(id: string, name: string) {
    if (!name.trim() || name.trim().length > 100)
      throw Error("Campaign name must be 1–100 characters");
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, "campaigns", id), {
      name: name.trim(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }
  watchCombat(id: string, next: Watch<Combat>, fail: Fail) {
    let root: any = null,
      entries: InitiativeEntry[] = [],
      ready = false;
    const emit = () => {
      if (!ready) return;
      if (!root) {
        next(emptyCombat());
        return;
      }
      const keys = (root.entryIndex as string).split("/").filter(Boolean);
      if (keys.some((k) => !entries.some((e) => e.id === k))) return;
      next({
        entries: keys.map((k) => entries.find((e) => e.id === k)!),
        activeId: root.activeId,
        round: root.round,
        revision: root.revision,
      });
    };
    const stopRoot = onSnapshot(
        this.row(id, "combat", "current"),
        (s) => {
          root = s.data() || null;
          emit();
        },
        fail,
      ),
      stopEntries = onSnapshot(
        collection(this.row(id, "combat", "current"), "entries"),
        (s) => {
          entries = s.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as InitiativeEntry,
          );
          ready = true;
          emit();
        },
        fail,
      );
    return () => {
      stopRoot();
      stopEntries();
    };
  }
  async saveCombat(id: string, value: Combat) {
    const c = validateCombat(value),
      ref = this.row(id, "combat", "current");
    await runTransaction(this.db, async (tx) => {
      const old = await tx.get(ref);
      if ((old.data()?.revision || 0) !== c.revision)
        throw Error(
          "Initiative changed on another device. Reload the tracker before saving.",
        );
      tx.set(ref, {
        entryIndex: c.entries.map((e) => e.id).join("/"),
        activeId: c.activeId,
        round: c.round,
        revision: c.revision + 1,
        updatedBy: this.uid(),
        updatedAt: serverTimestamp(),
      });
      for (const e of c.entries) tx.set(doc(ref, "entries", e.id), e);
      for (const key of (old.data()?.entryIndex || "")
        .split("/")
        .filter(Boolean))
        if (!c.entries.some((e) => e.id === key))
          tx.delete(doc(ref, "entries", key));
    });
  }
  async ensurePartyContact(id: string, user: Profile) {
    const batch = writeBatch(this.db);
    batch.set(this.row(id, "contacts", user.uid), {
      email: user.email.toLowerCase(),
      name: user.displayName,
    });
    await batch.commit();
    // Existing campaigns predate contacts. Admin can recover an address only from that member's bound invitation.
    if (isPlatformAdmin(user)) {
      const campaign = await getDoc(doc(this.db, "campaigns", id));
      const members = await Promise.all(
        (campaign.data()?.memberIds || []).map(async (uid: string) => {
          const m = await getDoc(this.row(id, "members", uid));
          return { id: uid, ...m.data() } as {
            id: string;
            inviteId: string;
            name: string;
          };
        }),
      );
      for (const m of members) {
        if (!m.inviteId) continue;
        const [contact, invite] = await Promise.all([
          getDoc(this.row(id, "contacts", m.id)),
          getDoc(this.row(id, "invitations", m.inviteId)),
        ]);
        if (!contact.exists() && invite.exists()) {
          const b = writeBatch(this.db);
          b.set(this.row(id, "contacts", m.id), {
            email: invite.data().email,
            name: m.name,
          });
          await b.commit();
        }
      }
    }
  }
  watchPartyContacts(id: string, next: Watch<PartyContact[]>, fail: Fail) {
    return onSnapshot(
      this.rows(id, "contacts"),
      (s) =>
        next(s.docs.map((d) => ({ id: d.id, ...d.data() }) as PartyContact)),
      fail,
    );
  }
  watchSessions(id: string, next: Watch<PartySession[]>, fail: Fail) {
    return onSnapshot(
      this.rows(id, "sessions"),
      (s) =>
        next(
          s.docs
            .map((d) => {
              const v = d.data();
              return {
                ...v,
                id: d.id,
                startAt: v.startAt.toMillis(),
                endAt: v.endAt.toMillis(),
              } as PartySession;
            })
            .sort((a, b) => b.startAt - a.startAt),
        ),
      fail,
    );
  }
  watchSessionDrafts(id: string, next: Watch<SessionDraft[]>, fail: Fail) {
    return onSnapshot(
      this.rows(id, "sessionDrafts"),
      (s) =>
        next(s.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionDraft)),
      fail,
    );
  }
  private async calendarToken(id: string, organizerUid: string) {
    const user = this.auth.currentUser;
    if (!user || organizerUid !== user.uid)
      throw Error("Only the original organizer can change this session");
    const campaign = await getDoc(doc(this.db, "campaigns", id));
    if (
      !campaign.exists() ||
      !campaign.data().dmIds.includes(user.uid)
    )
      throw Error("DM access required");
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_SCOPE);
    provider.setCustomParameters({ login_hint: user.email || "" });
    const result = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw Error("Google Calendar permission is required");
    return token;
  }
  async loadSession(id: string, session: PartySession): Promise<SessionChange> {
    if (session.organizerUid !== this.uid())
      throw Error("Only the original organizer can change this session");
    const pending = await getDoc(this.row(id, "sessionChanges", session.id));
    if (pending.exists())
      return { ...pending.data(), recovery: true } as SessionChange;
    return readCalendarSession(
      await this.calendarToken(id, session.organizerUid),
      id,
      session,
    );
  }
  async changeSession(id: string, value: SessionChange) {
    const { recovery: _, ...operationValue } = value;
    const change = { ...operationValue, draft: validateSession(value.draft) };
    const token = await this.calendarToken(id, change.draft.organizerUid);
    const ref = this.row(id, "sessions", change.draft.id),
      pending = this.row(id, "sessionChanges", change.draft.id);
    const session = await runTransaction(this.db, async (tx) => {
      const [old, operation] = await Promise.all([
        tx.get(ref),
        tx.get(pending),
      ]);
      if (
        !old.exists() ||
        old.data().organizerUid !== this.uid() ||
        old.data().status === "cancelled"
      )
        throw Error("This session cannot be changed");
      if ((old.data().revision || 0) !== change.revision)
        throw Error("The session changed. Close and reopen Edit.");
      if (operation.exists()) {
        if (JSON.stringify(operation.data()) !== JSON.stringify(change)) {
          // Firestore field order is not guaranteed.
          const o = operation.data() as SessionChange;
          if (
            o.operationId !== change.operationId ||
            o.action !== change.action ||
            o.etag !== change.etag ||
            JSON.stringify(validateSession(o.draft)) !==
              JSON.stringify(change.draft)
          )
            throw Error(
              "A change is pending. Close and reopen Edit to resume it.",
            );
        }
      } else tx.set(pending, change);
      const v = old.data();
      return {
        ...v,
        id: old.id,
        startAt: v.startAt.toMillis(),
        endAt: v.endAt.toMillis(),
      } as PartySession;
    });
    let updated: PartySession;
    try {
      updated = await changeCalendarSession(token, id, change, session);
    } catch (e) {
      if (
        (e as Error).message.startsWith(
          "This meeting changed in Google Calendar.",
        )
      ) {
        const batch = writeBatch(this.db);
        batch.delete(pending);
        await batch.commit();
      }
      throw e;
    }
    try {
      await runTransaction(this.db, async (tx) => {
        const current = await tx.get(ref);
        if ((current.data()?.revision || 0) !== change.revision)
          throw Error("Session changed");
        const { id: _, ...data } = updated;
        tx.set(ref, {
          ...data,
          revision: change.revision + 1,
          startAt: Timestamp.fromMillis(updated.startAt),
          endAt: Timestamp.fromMillis(updated.endAt),
        });
        tx.delete(pending);
      });
    } catch {
      throw Error(
        "Google Calendar was updated, but the party listing could not be saved. Reopen Edit or Cancel session to resume the saved change without duplicate notifications.",
      );
    }
  }
  async sendSession(id: string, value: SessionDraft) {
    const draft = validateSession(value),
      user = this.auth.currentUser;
    if (!user || draft.organizerUid !== user.uid)
      throw Error("Only the original organizer can retry this invitation");
    const c = await getDoc(doc(this.db, "campaigns", id));
    if (
      !c.exists() ||
      !c.data().dmIds.includes(user.uid)
    )
      throw Error("DM access required");
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_SCOPE);
    provider.setCustomParameters({
      login_hint: user.email || "",
      prompt: "consent",
    });
    const result = await reauthenticateWithPopup(user, provider),
      token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw Error("Google Calendar permission is required");
    const ref = this.row(id, "sessionDrafts", draft.id);
    await runTransaction(this.db, async (tx) => {
      const old = await tx.get(ref);
      if (old.exists()) {
        if (
          JSON.stringify(
            validateSession({ id: old.id, ...old.data() } as SessionDraft),
          ) !== JSON.stringify(draft)
        )
          throw Error(
            "This invitation draft is locked. Resume it from the session list.",
          );
      } else tx.set(ref, draft);
    });
    const session = await sendCalendarEvent(token, id, draft);
    const { id: _, ...data } = session;
    try {
      await runTransaction(this.db, async (tx) => {
        const sessionRef = this.row(id, "sessions", draft.id),
          existing = await tx.get(sessionRef);
        if (existing.exists()) return;
        tx.set(sessionRef, {
          ...data,
          startAt: Timestamp.fromMillis(session.startAt),
          endAt: Timestamp.fromMillis(session.endAt),
        });
        tx.delete(ref);
      });
    } catch {
      throw Error(
        "Google Calendar created the event, but the party listing could not be saved. Resume this saved draft to recover it without duplicate invitations.",
      );
    }
  }
}
