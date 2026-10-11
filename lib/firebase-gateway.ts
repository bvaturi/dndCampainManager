import {FILE_CHUNK_SIZE,validatePartyFile,checkFileContent,digestFile,assembleFile,type PartyFile} from './party-files';
import { isPlatformAdmin } from "./access";
import firebaseConfig from "./firebase-config.json";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  Bytes,
  getFirestore,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  type Query,
  type DocumentData,
} from "firebase/firestore";
import type { Gateway, Profile, Watch, Fail } from "./gateway";
import type {
  Campaign,
  CharacterRecord,
  CharacterType,
  Currency,
  Invitation,
  Member,
  PartyNote,
  PartySummary,
} from "./campaign-types";
import { summaryOf } from "./campaign-types";
import type { Character } from "./rules";
import { characterSchema } from "./character-schema";
import { defaultRates, emptyCoins, legacyWallet } from "./wallet";
const decode = (value: any): any =>
  value instanceof Timestamp
    ? value.toMillis()
    : Array.isArray(value)
      ? value.map(decode)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, decode(v)]),
          )
        : value;
const spellFields = new Set([
  "customSpells",
  "prepared",
  "cantrips",
  "secrets",
  "loreSecrets",
  "log",
]);
const coreFields = new Set([
  "className", "species", "subclass", "rulesEdition",
  "image",
  "name",
  "player",
  "level",
  "hp",
  "maxHP",
  "tempHP",
  "scores",
  "ac",
  "speed",
  "xp",
  "spent",
  "channel",
  "wrath",
  "stone",
  "reaction",
  "hitDiceSpent",
  "concentration",
  "deathSuccess",
  "deathFailure",
  "defaultCurrencyId",
]);
const indexIds = (value: string) => (value ? value.split("/") : []);
const compact = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Standard queries/onSnapshot are intentional: live party updates are required.
// Enterprise native access and realtime updates must be enabled on this database.
export class FirebaseGateway implements Gateway {
  private app = initializeApp(
    import.meta.env.VITE_FIREBASE_CONFIG
      ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
      : firebaseConfig,
  );
  private auth = getAuth(this.app);
  private db = getFirestore(
    this.app,
    import.meta.env.VITE_FIRESTORE_DATABASE || "campaigns",
  );
  private uid() {
    const user = this.auth.currentUser;
    if (!user) throw Error("Sign in first");
    return user.uid;
  }
  private camp(id: string) {
    return doc(this.db, "campaigns", id);
  }
  private row(id: string, kind: string, key: string) {
    return doc(this.db, "campaigns", id, kind, key);
  }
  private rows(id: string, kind: string) {
    return collection(this.db, "campaigns", id, kind);
  }
  private list<T>(q: Query<DocumentData>, next: Watch<T[]>, fail: Fail) {
    return onSnapshot(
      q,
      (s) => next(s.docs.map((d) => ({ id: d.id, ...decode(d.data()) }) as T)),
      fail,
    );
  }
  watchUser(next: Watch<Profile | null>) {
    return onAuthStateChanged(this.auth, (u) =>
      next(
        u
          ? {
              uid: u.uid,
              email: u.email || "",
              displayName: u.displayName || "Player",
              emailVerified: u.emailVerified,
            }
          : null,
      ),
    );
  }
  async signIn() {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }
  async signOut() {
    await signOut(this.auth);
  }
  watchCampaigns(user: Profile, next: Watch<Campaign[]>, fail: Fail) {
    return this.list(
      isPlatformAdmin(user) ? collection(this.db, "campaigns") : query(
        collection(this.db, "campaigns"),
        where("memberIds", "array-contains", user.uid),
      ),
      (rows: any[]) => next(rows.map((r) => ({ ...r, currencies: [] }))),
      fail,
    );
  }
  watchCampaign(id: string, next: Watch<Campaign | null>, fail: Fail) {
    let c: any = null,
      currencies: Currency[] = [];
    let ready = false;
    const emit = () => {
      if (c && ready)
        next({
          ...c,
          currencies: indexIds(c.currencyIndex)
            .map((key: string) => currencies.find((x) => x.id === key))
            .filter(Boolean),
        });
    };
    const a = onSnapshot(
        this.camp(id),
        (s) => {
          if (!s.exists()) {
            next(null);
            return;
          }
          c = { id: s.id, ...decode(s.data()) };
          emit();
        },
        fail,
      ),
      b = this.list<Currency>(
        this.rows(id, "currencies"),
        (rows) => {
          currencies = rows;
          ready = true;
          emit();
        },
        fail,
      );
    return () => {
      a();
      b();
    };
  }
  private async campaignCurrencies(id: string) {
    const rows = await getDocs(this.rows(id, "currencies"));
    return rows.docs.map((d) => decode(d.data()) as Currency);
  }
  watchMembers(id: string, next: Watch<Member[]>, fail: Fail) {
    return this.list<Member>(
      this.rows(id, "members"),
      (rows) =>
        next(
          rows.map((r) => ({
            ...r,
            email:
              r.id === this.auth.currentUser?.uid
                ? this.auth.currentUser?.email || ""
                : "",
          })),
        ),
      fail,
    );
  }
  watchCharacters(
    id: string,
    user: Profile,
    dm: boolean,
    next: Watch<CharacterRecord[]>,
    fail: Fail,
  ) {
    return this.list(
      dm
        ? this.rows(id, "characters")
        : query(this.rows(id, "characters"), where("ownerUid", "==", user.uid)),
      next,
      fail,
    );
  }
  watchSummaries(id: string, next: Watch<PartySummary[]>, fail: Fail) {
    return this.list(this.rows(id, "summaries"), next, fail);
  }
  watchNotes(id: string, priv: boolean, next: Watch<PartyNote[]>, fail: Fail) {
    return this.list(this.rows(id, priv ? "dmNotes" : "notes"), next, fail);
  }
  watchFiles(id:string,next:Watch<PartyFile[]>,fail:Fail){return this.list(this.rows(id,'files'),next,fail);}
  async uploadPartyFile(id:string,user:Profile,file:File,title:string){
    validatePartyFile(file);if(!title.trim()||title.trim().length>150)throw Error('Enter a file title of at most 150 characters.');
    const bytes=new Uint8Array(await file.arrayBuffer());await checkFileContent(bytes,file.type);
    const ref=doc(this.rows(id,'files')),batch=writeBatch(this.db),chunkCount=Math.ceil(bytes.length/FILE_CHUNK_SIZE);
    batch.set(ref,{name:file.name,title:title.trim(),contentType:file.type,size:file.size,chunkCount,sha256:await digestFile(bytes),authorUid:this.uid(),authorName:user.displayName,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),archived:false});
    for(let i=0;i<chunkCount;i++)batch.set(doc(ref,'chunks',String(i)),{index:i,data:Bytes.fromUint8Array(bytes.slice(i*FILE_CHUNK_SIZE,(i+1)*FILE_CHUNK_SIZE))});
    await batch.commit();
  }
  async downloadPartyFile(id:string,file:PartyFile){
    const snapshot=await getDocs(collection(this.row(id,'files',file.id),'chunks'));
    return assembleFile(file,snapshot.docs.map(d=>({index:d.data().index,data:d.data().data.toUint8Array()})));
  }
  async archivePartyFile(id:string,file:PartyFile,archived:boolean){
    await runTransaction(this.db,async tx=>{const ref=this.row(id,'files',file.id),snap=await tx.get(ref);if(!snap.exists()||decode(snap.data()).updatedAt!==file.updatedAt)throw Error('This file changed. Reopen it before saving.');tx.update(ref,{archived,updatedAt:serverTimestamp()});});
  }
  watchInvitations(id: string, next: Watch<Invitation[]>, fail: Fail) {
    return this.list(
      isPlatformAdmin(this.auth.currentUser) ? this.rows(id, "invitations") :
      query(this.rows(id, "invitations"), where("createdBy", "==", this.uid())),
      next,
      fail,
    );
  }
  async createCampaign(user: Profile, name: string, description: string) {
    if (!isPlatformAdmin(this.auth.currentUser)) throw Error("Only the platform admin can create campaigns");
    const ref = doc(collection(this.db, "campaigns")),
      batch = writeBatch(this.db);
    batch.set(ref, {
      name: name.trim(),
      description,
      ruleset: "2014",
      createdBy: this.uid(),
      memberIds: [this.uid()],
      dmIds: [],
      currencyIndex: "common",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(ref, "currencies", "common"), {
      id: "common",
      name: "Common currency",
      rates: defaultRates,
    });
    batch.set(doc(ref, "members", this.uid()), {
      name: user.displayName,
      joinedAt: serverTimestamp(),
      inviteId: "",
    });
    await batch.commit();
    return ref.id;
  }
  async joinCampaign(user: Profile, id: string, inviteId: string) {
    const invite = await getDoc(this.row(id, "invitations", inviteId));
    if (!invite.exists()) throw Error("Invitation unavailable");
    const data = decode(invite.data());
    if (data.email !== user.email.toLowerCase() || data.expiresAt < Date.now())
      throw Error("Invitation expired or intended for another account");
    const batch = writeBatch(this.db);
    batch.update(this.camp(id), {
      memberIds: arrayUnion(this.uid()),
      ...(data.role === 'dm' ? {dmIds: arrayUnion(this.uid())} : {}),
      updatedAt: serverTimestamp(),
    });
    batch.set(this.row(id, "members", this.uid()), {
      name: user.displayName,
      inviteId,
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
  }
  async updateCampaign(
    id: string,
    name: string,
    description: string,
    currencies: Currency[],
  ) {
    await runTransaction(this.db, async (tx) => {
      const old = await tx.get(this.camp(id)),
        ids = currencies.map((c) => c.id);
      tx.update(this.camp(id), {
        name: name.trim(),
        description,
        currencyIndex: ids.join("/"),
        updatedAt: serverTimestamp(),
      });
      for (const currency of currencies)
        tx.set(this.row(id, "currencies", currency.id), currency);
      for (const key of indexIds(old.data()?.currencyIndex || ""))
        if (!ids.includes(key)) tx.delete(this.row(id, "currencies", key));
    });
  }
  async createInvitation(id: string, email: string, role: 'player' | 'dm' = 'player') {
    if (role === 'dm' && !isPlatformAdmin(this.auth.currentUser)) throw Error("Only the platform admin can invite DMs");
    const c = await getDoc(this.camp(id)),
      ref = doc(this.rows(id, "invitations")),
      now = Date.now(),
      expiry = now + 7 * 86400000;
    const batch = writeBatch(this.db);
    batch.set(ref, {
      email: email.trim().toLowerCase(),
      role,
      campaignName: c.data()!.name,
      createdBy: this.uid(),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiry),
    });
    await batch.commit();
    return {
      id: ref.id,
      email: email.trim().toLowerCase(),
      role,
      campaignName: c.data()!.name,
      createdBy: this.uid(),
      createdAt: now,
      expiresAt: expiry,
    };
  }
  async revokeInvitation(id: string, inviteId: string) {
    const batch = writeBatch(this.db);
    batch.delete(this.row(id, "invitations", inviteId));
    await batch.commit();
  }
  async setDM(id: string, uid: string, enabled: boolean) {
    if (!isPlatformAdmin(this.auth.currentUser)) throw Error("Only the platform admin can assign DMs");
    const batch = writeBatch(this.db);
    batch.update(this.camp(id), {
      dmIds: enabled ? arrayUnion(uid) : arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }
  async removeMember(id: string, uid: string) {
    await runTransaction(this.db, async (tx) => {
      const member = await tx.get(this.row(id, "members", uid));
      tx.update(this.camp(id), {
        memberIds: arrayRemove(uid),
        dmIds: arrayRemove(uid),
        updatedAt: serverTimestamp(),
      });
      tx.delete(this.row(id, "members", uid));
      const invitation = member.data()?.inviteId;
      if (invitation) tx.delete(this.row(id, "invitations", invitation));
    });
  }
  private writeSheet(
    batch: { set: (ref: any, data: any) => any; delete: (ref: any) => any },
    id: string,
    charId: string,
    record: Omit<CharacterRecord, "id" | "updatedAt">,
    oldWalletIds: string[] = [],
    oldCustomIds: string[] = [],
  ) {
    const parsed = compact(characterSchema.parse(record.data)),
      wallets = parsed.wallets || [],
      walletIds = wallets.map((w) => w.id);
    delete parsed.wallets;
    batch.set(this.row(id, "characters", charId), {
      ownerUid: record.ownerUid,
      pendingOwnerEmail: record.pendingOwnerEmail||'',
      type: record.type,
      data: Object.fromEntries(
        Object.entries(parsed).filter(([k]) => coreFields.has(k)),
      ),
      revision: record.revision,
      updatedBy: record.updatedBy,
      walletIndex: walletIds.join("/"),
      customSpellIndex: (parsed.customSpells||[]).map(s=>s.id).join("/"),
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(this.row(id, "characters", charId), "details", "state"),
      Object.fromEntries(
        Object.entries(parsed).filter(
          ([k]) => !coreFields.has(k) && !spellFields.has(k),
        ),
      ),
    );
    batch.set(doc(this.row(id, "characters", charId), "history", "actions"), {
      entries: parsed.log,
    });
    for (const key of [
      "prepared",
      "cantrips",
      "secrets",
      "loreSecrets",
    ] as const)
      if (parsed[key])
        batch.set(doc(this.row(id, "characters", charId), "spells", key), {
          ids: parsed[key],
        });
    for(const spell of parsed.customSpells||[])batch.set(doc(this.row(id,"characters",charId),"customSpells",spell.id),spell);
    for(const key of oldCustomIds)if(!parsed.customSpells?.some(s=>s.id===key))batch.delete(doc(this.row(id,"characters",charId),"customSpells",key));
    for (const wallet of wallets)
      batch.set(
        doc(this.row(id, "characters", charId), "wallets", wallet.id),
        wallet,
      );
    for (const key of oldWalletIds)
      if (!walletIds.includes(key))
        batch.delete(doc(this.row(id, "characters", charId), "wallets", key));
    batch.set(this.row(id, "summaries", charId), {
      ...summaryOf({ ...record, updatedAt: 0 }),
      updatedAt: serverTimestamp(),
    });
  }
  private async fullSheet(id: string, charId: string, r: any) {
    const ref = this.row(id, "characters", charId);
    const [wallets, details, spells, history, customSpells] = await Promise.all([
      getDocs(collection(ref, "wallets")),
      getDoc(doc(ref, "details", "state")),
      getDocs(collection(ref, "spells")),
      getDoc(doc(ref, "history", "actions")),
      getDocs(collection(ref,"customSpells")),
    ]);
    const byId = new Map(wallets.docs.map((d) => [d.id, decode(d.data())]));
    return {
      ...decode(details.data()),
      ...r.data,
      ...Object.fromEntries(spells.docs.map((d) => [d.id, d.data().ids])),
      log: history.data()?.entries || [],
      ...(r.type==="custom"?{customSpells:indexIds(r.customSpellIndex||"").map(key=>customSpells.docs.find(d=>d.id===key)?.data()).filter(Boolean)}:{}),
      wallets: indexIds(r.walletIndex)
        .map((key) => byId.get(key))
        .filter(Boolean),
    } as Character;
  }
  async createCharacter(
    id: string,
    _user: Profile,
    ownerUid: string,
    type: CharacterType,
    data: Character,
    pendingOwnerEmail = "",
  ) {
    data = this.wallets(data, await this.campaignCurrencies(id));
    const ref = doc(this.rows(id, "characters")),
      batch = writeBatch(this.db);
    this.writeSheet(batch, id, ref.id, {
      ownerUid,
      pendingOwnerEmail,
      type,
      data,
      revision: 1,
      updatedBy: this.uid(),
    });
    await batch.commit();
    return ref.id;
  }
  async claimInvitedCharacters(id:string,user:Profile) {
    const pending=await getDocs(query(this.rows(id,"characters"),where("pendingOwnerEmail","==",user.email.toLowerCase())));
    for(const candidate of pending.docs)await runTransaction(this.db,async tx=>{
      const snap=await tx.get(candidate.ref);if(!snap.exists()||snap.data().pendingOwnerEmail!==user.email.toLowerCase())return;
      const record=decode(snap.data()) as CharacterRecord;
      const next={...record,ownerUid:this.uid(),pendingOwnerEmail:"",revision:record.revision+1,updatedBy:this.uid()};
      tx.update(candidate.ref,{ownerUid:next.ownerUid,pendingOwnerEmail:"",revision:next.revision,updatedBy:next.updatedBy,updatedAt:serverTimestamp()});
      tx.set(this.row(id,"summaries",candidate.id),{...summaryOf(next),updatedAt:serverTimestamp()});
    });
  }
  async assignCharacter(id: string, charId: string, ownerUid: string) {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.row(id, "characters", charId));
      if (!snap.exists()) throw Error("Character unavailable");
      const r = decode(snap.data()) as CharacterRecord;
      const wallets = await tx.get(this.row(id, "characters", charId));
      const full = await this.fullSheet(id, charId, r);
      this.writeSheet(
        tx,
        id,
        charId,
        {
          ...r,
          data: this.wallets(full, []),
          ownerUid,
          pendingOwnerEmail: "",
          revision: r.revision + 1,
          updatedBy: this.uid(),
        },
        indexIds(wallets.data()?.walletIndex || ""),
        indexIds(snap.data()?.customSpellIndex || ""),
      );
    });
  }
  private wallets(data: Character, currencies: Currency[]) {
    const character = compact(data);
    character.wallets = character.wallets?.length
      ? character.wallets
      : [legacyWallet(character.coins)];
    for (const currency of currencies) {
      const wallet = character.wallets.find((w) => w.id === currency.id);
      if (wallet) {
        wallet.name = currency.name;
        wallet.rates = currency.rates;
      } else character.wallets.push({ ...currency, coins: emptyCoins() });
    }
    return character;
  }
  sheetStore(
    id: string,
    charId: string,
    _user: Profile,
    _currencies: Currency[],
  ) {
    const ref = this.row(id, "characters", charId);
    return {
      load: async () => {
        const [snap, currencies] = await Promise.all([
          getDoc(ref),
          this.campaignCurrencies(id),
        ]);
        if (!snap.exists()) throw Error("Character unavailable");
        const r = decode(snap.data()) as CharacterRecord;
        return {
          character: this.wallets(
            await this.fullSheet(id, charId, r),
            currencies,
          ),
          revision: r.revision,
        };
      },
      save: async (data: Character, revision: number) => {
        const currencies = await this.campaignCurrencies(id);
        return runTransaction(this.db, async (tx) => {
          const snap = await tx.get(ref),
            camp = await tx.get(this.camp(id));
          if (!snap.exists()) throw Error("Character unavailable");
          const r = decode(snap.data()) as CharacterRecord;
          if (r.revision !== revision)
            throw Error(
              "This sheet changed on another device. Export your edits, then reload.",
            );
          this.writeSheet(
            tx,
            id,
            charId,
            {
              ownerUid: r.ownerUid,
              pendingOwnerEmail: r.pendingOwnerEmail||"",
              type: r.type,
              data: this.wallets(data, currencies),
              revision: revision + 1,
              updatedBy: this.uid(),
            },
            indexIds(snap.data()?.walletIndex || ""),
            indexIds(snap.data()?.customSpellIndex || ""),
          );
          return { revision: revision + 1 };
        });
      },
      subscribe: (
        next: Watch<{ character: Character; revision: number }>,
        fail: Fail,
      ) =>
        onSnapshot(
          ref,
          (s) => {
            if (s.exists() && !s.metadata.hasPendingWrites) {
              const r = decode(s.data()) as CharacterRecord;
              this.fullSheet(id, charId, r)
                .then((character) => next({ character, revision: r.revision }))
                .catch(fail);
            }
          },
          fail,
        ),
    };
  }
  async saveNote(
    id: string,
    priv: boolean,
    user: Profile,
    note: Pick<PartyNote, "title" | "text" | "kind" | "url">,
    existing?: PartyNote,
  ) {
    const ref = existing
      ? this.row(id, priv ? "dmNotes" : "notes", existing.id)
      : doc(this.rows(id, priv ? "dmNotes" : "notes"));
    await runTransaction(this.db, async (tx) => {
      if (existing) {
        const snap = await tx.get(ref);
        if (
          !snap.exists() ||
          decode(snap.data()).updatedAt !== existing.updatedAt
        )
          throw Error("This note changed. Reopen it before saving.");
        tx.update(ref, { ...note, updatedAt: serverTimestamp() });
      } else
        tx.set(ref, {
          ...note,
          authorUid: this.uid(),
          authorName: user.displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
    });
  }
  async deleteNote(id: string, priv: boolean, note: PartyNote) {
    await runTransaction(this.db, async (tx) => {
      const ref = this.row(id, priv ? "dmNotes" : "notes", note.id),
        snap = await tx.get(ref);
      if (!snap.exists() || decode(snap.data()).updatedAt !== note.updatedAt)
        throw Error("This note changed. Reopen it before deleting.");
      tx.delete(ref);
    });
  }
}
