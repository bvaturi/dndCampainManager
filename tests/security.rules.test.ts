import { aradInitial } from "../lib/bard";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { initial } from "../lib/rules";
import { defaultRates, emptyCoins } from "../lib/wallet";
let env: RulesTestEnvironment;
const user = (
  uid: string,
  email = `${uid}@example.test`,
  provider = "google.com",
  verified = true,
) =>
  env
    .authenticatedContext(uid, {
      email,
      email_verified: verified,
      name: uid,
      firebase: { sign_in_provider: provider as any },
    })
    .firestore();
const camp = (db: any, id = "one") => doc(db, "campaigns", id);
const row = (db: any, kind: string, key: string, id = "one") =>
  doc(db, "campaigns", id, kind, key);
const campaign = (uid: string) => ({
  name: "Test campaign",
  description: "",
  ruleset: "2014",
  createdBy: uid,
  memberIds: [uid],
  dmIds: [uid],
  currencyIndex: "common",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
async function bootstrap(uid = "dm", id = "one") {
  const db = user(uid),
    batch = writeBatch(db);
  batch.set(camp(db, id), campaign(uid));
  batch.set(row(db, "currencies", "common", id), {
    id: "common",
    name: "Common",
    rates: defaultRates,
  });
  batch.set(row(db, "members", uid, id), {
    name: uid,
    joinedAt: serverTimestamp(),
    inviteId: "",
  });
  await batch.commit();
}
async function invite(
  email = "player@example.test",
  key = "invite",
  expiry = Date.now() + 3600000,
) {
  const db = user("dm");
  await setDoc(row(db, "invitations", key), {
    email,
    campaignName: "Test campaign",
    createdBy: "dm",
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiry),
  });
}
async function join(uid = "player", key = "invite") {
  const db = user(uid),
    batch = writeBatch(db);
  batch.update(camp(db), {
    memberIds: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
  batch.set(row(db, "members", uid), {
    name: uid,
    joinedAt: serverTimestamp(),
    inviteId: key,
  });
  return batch.commit();
}
const sheet = (uid = "player", revision = 1, data = initial) => ({
  ownerUid: uid,
  type: "varen",
  data,
  revision,
  updatedBy: uid,
  updatedAt: serverTimestamp(),
});
const summary = (r: any) => ({
  ownerUid: r.ownerUid,
  name: r.data.name,
  player: r.data.player,
  className: "Goliath · Tempest cleric",
  level: r.data.level,
  hp: r.data.hp,
  maxHP: r.data.maxHP,
  ac: r.data.ac,
  concentration: r.data.concentration,
  updatedAt: serverTimestamp(),
});
const spellFields = new Set([
  "prepared",
  "cantrips",
  "secrets",
  "loreSecrets",
  "log",
]);
const coreFields = new Set([
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
async function writeSheet(db: any, r = sheet(), extra = {}, summaryExtra = {}) {
  const batch = writeBatch(db);
  const data = { ...r.data };
  delete data.wallets;
  const walletIds = (r.data.wallets || []).map((w: any) => w.id);
  batch.set(row(db, "characters", "hero"), {
    ...r,
    data: Object.fromEntries(
      Object.entries(data).filter(([k]) => coreFields.has(k)),
    ),
    walletIndex: walletIds.join("/"),
    ...extra,
  });
  batch.set(
    doc(row(db, "characters", "hero"), "details", "state"),
    Object.fromEntries(
      Object.entries(data).filter(
        ([k]) => !coreFields.has(k) && !spellFields.has(k),
      ),
    ),
  );
  batch.set(doc(row(db, "characters", "hero"), "history", "actions"), {
    entries: data.log,
  });
  for (const key of ["prepared", "cantrips", "secrets", "loreSecrets"] as const)
    if (data[key])
      batch.set(doc(row(db, "characters", "hero"), "spells", key), {
        ids: data[key],
      });
  for (const w of r.data.wallets || [])
    batch.set(doc(row(db, "characters", "hero"), "wallets", w.id), w);
  batch.set(row(db, "summaries", "hero"), { ...summary(r), ...summaryExtra });
  return batch.commit();
}
const note = (uid = "player") => ({
  title: "Quest",
  text: "Find the tower",
  kind: "quest",
  authorUid: uid,
  authorName: uid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "Firestore access rules",
  () => {
    beforeAll(async () => {
      const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
      env = await initializeTestEnvironment({
        projectId: "demo-stormkeep",
        firestore: {
          host,
          port: Number(port),
          rules: readFileSync("firestore.rules", "utf8"),
        },
      });
    }, 30000);
    afterAll(async () => {
      await env?.cleanup();
    });
    beforeEach(async () => {
      await env.clearFirestore();
      await bootstrap();
      await invite();
      await join();
    });
    it("requires authenticated verified Google users", async () => {
      await assertFails(getDoc(camp(env.unauthenticatedContext().firestore())));
      await assertFails(
        getDoc(camp(user("player", "player@example.test", "password"))),
      );
      await assertFails(
        getDoc(
          camp(user("player", "player@example.test", "google.com", false)),
        ),
      );
    });
    it("creates campaigns only with an atomic creator member", async () => {
      const db = user("new");
      await assertFails(setDoc(camp(db, "bad"), campaign("new")));
      await assertSucceeds(bootstrap("new", "two"));
    });
    it("limits queries and isolates campaigns", async () => {
      await bootstrap("other", "two");
      const db = user("player");
      await assertSucceeds(
        getDocs(
          query(
            collection(db, "campaigns"),
            where("memberIds", "array-contains", "player"),
          ),
        ),
      );
      await assertFails(getDocs(collection(db, "campaigns")));
      await assertFails(getDoc(camp(db, "two")));
      await assertFails(getDoc(camp(user("outsider"))));
    });
    it("does not allow self promotion or fabricated members", async () => {
      const db = user("player");
      await assertFails(
        updateDoc(camp(db), {
          dmIds: ["dm", "player"],
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        updateDoc(camp(user("dm")), {
          memberIds: ["dm", "player", "outsider"],
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        setDoc(row(user("dm"), "members", "outsider"), {
          name: "outsider",
          joinedAt: serverTimestamp(),
          inviteId: "",
        }),
      );
    });
    it("rejects wrong email, expired, revoked and incomplete joins", async () => {
      await assertFails(join("outsider"));
      await invite("late@example.test", "late", Date.now() + 1000);
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(row(c.firestore(), "invitations", "late"), {
          expiresAt: Timestamp.fromMillis(Date.now() - 1),
        }),
      );
      await assertFails(join("late", "late"));
      await assertFails(join("missing", "revoked"));
      await assertFails(
        updateDoc(camp(user("outsider")), {
          memberIds: arrayUnion("outsider"),
          updatedAt: serverTimestamp(),
        }),
      );
    });
    it("keeps invitation emails private from other players and DMs", async () => {
      await assertSucceeds(
        getDoc(row(user("player"), "invitations", "invite")),
      );
      await assertFails(getDoc(row(user("outsider"), "invitations", "invite")));
      await updateDoc(camp(user("dm")), {
        dmIds: ["dm", "player"],
        updatedAt: serverTimestamp(),
      });
      await assertFails(
        getDocs(collection(user("player"), "campaigns", "one", "invitations")),
      );
      await assertSucceeds(
        getDocs(
          query(
            collection(user("dm"), "campaigns", "one", "invitations"),
            where("createdBy", "==", "dm"),
          ),
        ),
      );
    });
    it("saves sheets and summaries atomically with limited public fields", async () => {
      await assertSucceeds(writeSheet(user("player")));
      await assertSucceeds(getDoc(row(user("dm"), "characters", "hero")));
      await assertSucceeds(getDoc(row(user("player"), "summaries", "hero")));
      await assertFails(
        writeSheet(user("player"), sheet("player", 2), {}, { notes: "secret" }),
      );
      await assertFails(
        writeSheet(user("player"), sheet("player", 2), {}, { hp: 999 }),
      );
      await assertFails(
        setDoc(row(user("player"), "characters", "solo"), sheet()),
      );
    });
    it("accepts bard optional fields and bounded maximum notes", async () => {
      await assertSucceeds(
        writeSheet(
          user("player"),
          {
            ...sheet("player", 1, {
              ...aradInitial,
              notes: "x".repeat(20000),
              log: Array.from({ length: 30 }, () => "used spell".repeat(30)),
            }),
            type: "arad",
          },
          {},
          { className: "Changeling · Bard" },
        ),
      );
    });
    it("prevents another member reading or changing full sheets", async () => {
      await invite("second@example.test", "second");
      await join("second", "second");
      await writeSheet(user("player"));
      await assertFails(getDoc(row(user("second"), "characters", "hero")));
      await assertFails(
        writeSheet(user("second"), {
          ...sheet("player", 2),
          updatedBy: "second",
        }),
      );
      await assertSucceeds(getDoc(row(user("second"), "summaries", "hero")));
    });
    it("supports correct owner-filtered player queries and DM queries", async () => {
      await writeSheet(user("player"));
      await assertSucceeds(
        getDocs(
          query(
            collection(user("player"), "campaigns", "one", "characters"),
            where("ownerUid", "==", "player"),
          ),
        ),
      );
      await assertFails(
        getDocs(collection(user("player"), "campaigns", "one", "characters")),
      );
      await assertSucceeds(
        getDocs(collection(user("dm"), "campaigns", "one", "characters")),
      );
    });
    it("blocks forged ownership, type, revision and updater", async () => {
      await writeSheet(user("player"));
      await assertFails(writeSheet(user("player"), sheet("dm", 2)));
      await assertFails(writeSheet(user("player"), sheet("player", 1)));
      await assertFails(
        writeSheet(user("player"), sheet("player", 2), { type: "arad" }),
      );
      await assertFails(
        writeSheet(user("player"), sheet("player", 2), { updatedBy: "dm" }),
      );
      await assertSucceeds(
        writeSheet(user("dm"), { ...sheet("dm", 2), updatedBy: "dm" }),
      );
    });
    it("validates schema on both create and update", async () => {
      await assertFails(writeSheet(user("player"), sheet(), { admin: true }));
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 1, { ...initial, notes: "x".repeat(20001) }),
        ),
      );
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 1, { ...initial, scores: [20] }),
        ),
      );
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 1, { ...initial, prepared: [{ id: "evil" }] as any }),
        ),
      );
      await writeSheet(user("player"));
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 2, { ...initial, level: 21 }),
        ),
      );
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 2, { ...initial, proficient: ["Unknown"] }),
        ),
      );
    });
    it("accepts maximum bounded wallets and rejects bad rates and oversized maps", async () => {
      const wallets = Array.from({ length: 20 }, (_, i) => ({
        id: `wallet${i}`,
        name: "Coins",
        coins: emptyCoins(),
        rates: defaultRates,
      }));
      await assertSucceeds(
        writeSheet(user("player"), sheet("player", 1, { ...initial, wallets })),
      );
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 2, {
            ...initial,
            wallets: [{ ...wallets[0], rates: { ...defaultRates, cp: 0 } }],
          }),
        ),
      );
      await assertFails(
        writeSheet(
          user("player"),
          sheet("player", 2, {
            ...initial,
            wallets: [
              {
                ...wallets[0],
                coins: { ...emptyCoins(), secret: "hidden" } as any,
              },
            ],
          }),
        ),
      );
    });
    it("restricts shared note editing and immutable author fields", async () => {
      await setDoc(row(user("player"), "notes", "n"), note());
      await assertSucceeds(getDoc(row(user("dm"), "notes", "n")));
      await assertFails(
        updateDoc(row(user("player"), "notes", "n"), {
          authorUid: "dm",
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        updateDoc(row(user("player"), "notes", "n"), {
          text: "x".repeat(20001),
          updatedAt: serverTimestamp(),
        }),
      );
      await assertSucceeds(
        updateDoc(row(user("dm"), "notes", "n"), {
          text: "DM edit",
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        setDoc(row(user("player"), "notes", "fake"), note("dm")),
      );
    });
    it("keeps DM notebooks inaccessible to players", async () => {
      await assertSucceeds(
        setDoc(row(user("dm"), "dmNotes", "secret"), note("dm")),
      );
      await assertFails(getDoc(row(user("player"), "dmNotes", "secret")));
      await assertFails(
        getDocs(collection(user("player"), "campaigns", "one", "dmNotes")),
      );
      await assertFails(setDoc(row(user("player"), "dmNotes", "new"), note()));
    });
    it("protects creator and limits DM promotion to campaign members", async () => {
      await assertFails(
        updateDoc(camp(user("dm")), {
          dmIds: ["player"],
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        updateDoc(camp(user("dm")), {
          dmIds: ["dm", "outsider"],
          updatedAt: serverTimestamp(),
        }),
      );
      await assertSucceeds(
        updateDoc(camp(user("dm")), {
          dmIds: ["dm", "player"],
          updatedAt: serverTimestamp(),
        }),
      );
    });
    it("revokes nested access after membership removal", async () => {
      await writeSheet(user("player"));
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(camp(c.firestore()), { memberIds: ["dm"], dmIds: ["dm"] }),
      );
      await assertFails(getDoc(row(user("player"), "characters", "hero")));
      await assertFails(getDoc(row(user("player"), "summaries", "hero")));
      await assertFails(
        getDocs(collection(user("player"), "campaigns", "one", "notes")),
      );
      await assertFails(writeSheet(user("player"), sheet("player", 2)));
    });
    it("validates campaign currencies at their maximum size", async () => {
      const db = user("dm"),
        batch = writeBatch(db),
        currencies = Array.from({ length: 20 }, (_, i) => ({
          id: `currency${i}`,
          name: "Currency",
          rates: defaultRates,
        }));
      batch.update(camp(db), {
        currencyIndex: currencies.map((c) => c.id).join("/"),
        updatedAt: serverTimestamp(),
      });
      for (const c of currencies) batch.set(row(db, "currencies", c.id), c);
      await assertSucceeds(batch.commit());
    });
    it("denies orphaned and unknown paths", async () => {
      await assertFails(
        setDoc(doc(user("player"), "users", "player"), { email: "private" }),
      );
      await assertFails(
        setDoc(row(user("player"), "notes", "n", "nonexistent"), note()),
      );
      await assertFails(
        getDoc(row(user("player"), "dmNotes", "secret", "nonexistent")),
      );
    });
  },
);
