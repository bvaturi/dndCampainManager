import {newCharacter} from "../lib/custom-character";
import {classLabel} from "../lib/campaign-types";
import { aradInitial } from "../lib/bard";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Bytes,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
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
const admin = () => user("admin", "barakv01@gmail.com");
const camp = (db: any, id = "one") => doc(db, "campaigns", id);
const row = (db: any, kind: string, key: string, id = "one") =>
  doc(db, "campaigns", id, kind, key);
const campaign = (uid: string) => ({
  name: "Test campaign",
  description: "",
  ruleset: "2014",
  createdBy: "admin",
  memberIds: ["admin"],
  dmIds: [],
  currencyIndex: "common",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
async function bootstrap(uid = "dm", id = "one") {
  const db = admin(),
    batch = writeBatch(db);
  batch.set(camp(db, id), campaign("admin"));
  batch.set(row(db, "currencies", "common", id), {
    id: "common",
    name: "Common",
    rates: defaultRates,
  });
  batch.set(row(db, "members", "admin", id), {
    name: "admin",
    joinedAt: serverTimestamp(),
    inviteId: "",
  });
  await batch.commit();
  if (uid !== "admin") {
    await setDoc(row(db,"invitations","assigned-dm",id), {email:`${uid}@example.test`,role:"dm",campaignName:"Test campaign",createdBy:"admin",createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+3600000)});
    await join(uid,"assigned-dm",id,true);
  }
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
async function join(uid = "player", key = "invite", id = "one", asDM = false) {
  const db = user(uid),
    batch = writeBatch(db);
  batch.update(camp(db, id), {
    memberIds: arrayUnion(uid),
    ...(asDM ? {dmIds: arrayUnion(uid)} : {}),
    updatedAt: serverTimestamp(),
  });
  batch.set(row(db, "members", uid, id), {
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
  image: r.data.image || "",
  ownerUid: r.ownerUid,
  name: r.data.name,
  player: r.data.player,
  className: classLabel(r.type,r.data),
  level: r.data.level,
  hp: r.data.hp,
  maxHP: r.data.maxHP,
  ac: r.data.ac,
  concentration: r.data.concentration,
  updatedAt: serverTimestamp(),
});
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
async function writeSheet(db: any, r: ReturnType<typeof sheet> & {pendingOwnerEmail?:string} = sheet(), extra = {}, summaryExtra = {}) {
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
    customSpellIndex: (data.customSpells||[]).map((s:any)=>s.id).join("/"),
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
  for(const spell of data.customSpells||[])batch.set(doc(row(db,"characters","hero"),"customSpells",spell.id),spell);
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
    it("only admin creates campaigns with an atomic creator member", async () => {
      const db = user("new");
      await assertFails(setDoc(camp(db, "bad"), {...campaign("new"),createdBy:"new",memberIds:["new"],dmIds:["new"]}));
      await assertFails(setDoc(camp(admin(), "bad"), campaign("admin")));
      const batch=writeBatch(db);
      batch.set(camp(db,"forged"),{...campaign("new"),createdBy:"new",memberIds:["new"],dmIds:["new"]});
      batch.set(row(db,"members","new","forged"),{name:"new",joinedAt:serverTimestamp(),inviteId:""});
      batch.set(row(db,"currencies","common","forged"),{id:"common",name:"Common",rates:defaultRates});
      await assertFails(batch.commit());
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
      await updateDoc(camp(admin()), {
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
    it("only admin assigns DMs and only to campaign members", async () => {
      await assertFails(updateDoc(camp(user("dm")),{dmIds:["dm","player"],updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(camp(user("dm")),{dmIds:["player"],updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(camp(admin()),{dmIds:["outsider"],updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(camp(admin()),{dmIds:["dm","player"],updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(camp(admin()),{dmIds:["player"],updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(camp(admin()),{memberIds:["player"],updatedAt:serverTimestamp()}));
    });
    it("admin can manage all campaigns while each DM is scoped to their own", async () => {
      await bootstrap("other","two");
      await assertSucceeds(getDocs(collection(admin(),"campaigns")));
      await assertSucceeds(getDoc(camp(admin(),"two")));
      await assertFails(getDoc(camp(user("dm"),"two")));
      await assertFails(getDocs(collection(user("dm"),"campaigns")));
      await assertFails(updateDoc(camp(user("dm"),"two"),{name:"Hijack",updatedAt:serverTimestamp()}));
      await assertFails(getDocs(collection(user("dm"),"campaigns","two","dmNotes")));
      await assertSucceeds(updateDoc(camp(user("dm")),{name:"DM's campaign",updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(camp(admin(),"two"),{name:"Admin edit",updatedAt:serverTimestamp()}));
      await writeSheet(user("player"));
      await assertSucceeds(getDoc(row(admin(),"characters","hero")));
      await assertSucceeds(writeSheet(admin(),{...sheet("player",2),updatedBy:"admin"}));
    });
    it("rejects spoofed admin identities and profile-based privileges", async () => {
      await assertFails(getDocs(collection(user("fake","barakv01@gmail.com","password"),"campaigns")));
      await assertFails(getDocs(collection(user("fake","barakv01@gmail.com","google.com",false),"campaigns")));
      await assertFails(getDocs(collection(user("fake","Barakv01@elsewhere.test"),"campaigns")));
      await assertFails(setDoc(doc(user("dm"),"users","dm"),{role:"admin",email:"barakv01@gmail.com"}));
    });
    it("only admin can invite a DM; invitation grants exactly that campaign", async () => {
      const value={email:"newdm@example.test",role:"dm",campaignName:"Test campaign",createdBy:"dm",createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+3600000)};
      await assertFails(setDoc(row(user("dm"),"invitations","newdm"),value));
      await assertSucceeds(setDoc(row(admin(),"invitations","newdm"),{...value,createdBy:"admin"}));
      await assertFails(join("newdm","newdm"));
      await assertSucceeds(join("newdm","newdm","one",true));
      await assertSucceeds(getDocs(collection(user("newdm"),"campaigns","one","dmNotes")));
      await bootstrap("other","two");
      await assertFails(getDoc(camp(user("newdm"),"two")));
      await assertFails(updateDoc(camp(user("newdm")),{dmIds:arrayUnion("player"),updatedAt:serverTimestamp()}));
    });
    it("players cannot promote themselves with a player invitation", async () => {
      await invite("guest@example.test","guest");
      await assertFails(join("guest","guest","one",true));
      await assertSucceeds(join("guest","guest"));
    });
    it("DM demotion immediately revokes private access and cannot be reversed by the DM", async () => {
      await setDoc(row(user("dm"),"dmNotes","secret"),note("dm"));
      await writeSheet(user("player"));
      await assertSucceeds(updateDoc(camp(admin()),{dmIds:[],updatedAt:serverTimestamp()}));
      await assertFails(getDoc(row(user("dm"),"dmNotes","secret")));
      await assertFails(getDoc(row(user("dm"),"characters","hero")));
      await assertFails(updateDoc(camp(user("dm")),{dmIds:["dm"],updatedAt:serverTimestamp()}));
      await assertSucceeds(getDoc(row(user("dm"),"summaries","hero")));
    });
    it("DMs cannot remove another DM or revoke admin DM invitations", async () => {
      await assertFails(deleteDoc(row(user("dm"),"invitations","assigned-dm")));
      await assertSucceeds(deleteDoc(row(admin(),"invitations","assigned-dm")));
      const db=user("dm"),batch=writeBatch(db);
      batch.update(camp(db),{memberIds:arrayRemove("admin"),updatedAt:serverTimestamp()});
      batch.delete(row(db,"members","admin"));
      await assertFails(batch.commit());
      await updateDoc(camp(admin()),{dmIds:["dm","player"],updatedAt:serverTimestamp()});
      const removal=writeBatch(db);
      removal.update(camp(db),{memberIds:arrayRemove("player"),dmIds:arrayRemove("player"),updatedAt:serverTimestamp()});
      removal.delete(row(db,"members","player"));
      await assertFails(removal.commit());
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
    it("saves shared links and rejects unsafe URLs on create and update", async () => {
      const db=user("player");
      await assertSucceeds(setDoc(row(db,"notes","link"),{...note(),kind:"link",text:"",url:"https://www.aidedd.org/dnd-filters/spells-5e.php"}));
      await assertSucceeds(getDoc(row(user("dm"),"notes","link")));
      await assertFails(updateDoc(row(db,"notes","link"),{url:"javascript:alert(1)",updatedAt:serverTimestamp()}));
      await assertFails(setDoc(row(db,"notes","unsafe"),{...note(),kind:"link",url:"data:text/html,bad"}));
      await assertFails(setDoc(row(db,"notes","missing"),{...note(),kind:"link"}));
      await assertFails(updateDoc(row(db,"notes","link"),{url:"https://"+"a".repeat(2048),updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(row(db,"notes","link"),{title:"Updated resource",url:"https://example.com/guide",updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(row(user("dm"),"notes","link"),{authorUid:"dm",updatedAt:serverTimestamp()}));
    });
    it("shares portraits atomically and bounds uploaded image content", async () => {
      const db=user("player");
      await assertSucceeds(writeSheet(db,sheet("player",1,{...initial,image:"https://example.com/portrait.jpg"})));
      await assertSucceeds(getDoc(row(user("dm"),"summaries","hero")));
      await assertFails(writeSheet(db,sheet("player",2,{...initial,image:"javascript:alert(1)"})));
      await assertFails(writeSheet(db,sheet("player",2,{...initial,image:"data:image/svg+xml;base64,PHN2Zz4="})));
      await assertFails(writeSheet(db,sheet("player",2,{...initial,image:"https://example.com/portrait.jpg"}),{}, {image:"https://example.com/forged.jpg"}));
      await assertSucceeds(writeSheet(db,sheet("player",2,{...initial,image:"data:image/jpeg;base64,"+"A".repeat(179960)})));
      await assertFails(writeSheet(db,sheet("player",3,{...initial,image:"data:image/jpeg;base64,"+"A".repeat(180000)})));
      await assertSucceeds(writeSheet(db,sheet("player",3,{...initial,image:""})));
    });
    it("shares file bytes only inside the campaign and preserves authorship", async () => {
      const db=user('player'),ref=row(db,'files','pdf'),chunk=doc(ref,'chunks','0');
      const payload={name:'guide.pdf',title:'Campaign guide',contentType:'application/pdf',size:9,chunkCount:1,sha256:'a'.repeat(64),authorUid:'player',authorName:'player',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),archived:false};
      const bytes={index:0,data:Bytes.fromUint8Array(new TextEncoder().encode('%PDF-test'))};
      const upload=(data=payload,part=bytes,target=db,key='pdf')=>{const batch=writeBatch(target),r=row(target,'files',key);batch.set(r,data);batch.set(doc(r,'chunks','0'),part);return batch.commit();};
      await assertFails(setDoc(ref,payload));
      await assertSucceeds(upload());
      await assertSucceeds(getDoc(doc(row(user('dm'),'files','pdf'),'chunks','0')));
      await assertFails(getDoc(doc(row(user('outsider'),'files','pdf'),'chunks','0')));
      await assertFails(getDocs(collection(row(env.unauthenticatedContext().firestore(),'files','pdf'),'chunks')));
      await assertFails(upload({...payload,authorUid:'dm'},bytes,db,'forged'));
      await assertFails(upload({...payload,contentType:'image/svg+xml'},bytes,db,'svg'));
      await assertFails(upload({...payload,size:8388609,chunkCount:33},bytes,db,'huge'));
      await assertFails(upload(payload,{...bytes,index:1},db,'index'));
      await assertFails(upload(payload,{...bytes,data:Bytes.fromUint8Array(new Uint8Array(10))},db,'length'));
      await assertFails(updateDoc(chunk,{data:Bytes.fromUint8Array(new Uint8Array(9))}));
      await assertFails(deleteDoc(chunk));
      await assertFails(updateDoc(ref,{authorUid:'dm',updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(ref,{title:'b'.repeat(151),updatedAt:serverTimestamp()}));
      await assertFails(setDoc(doc(ref,'chunks','1'),{index:1,data:Bytes.fromUint8Array(new Uint8Array(9))}));
      await invite('second@example.test','second');await join('second','second');
      await assertFails(updateDoc(row(user('second'),'files','pdf'),{archived:true,updatedAt:serverTimestamp()}));
      await assertSucceeds(getDoc(doc(row(user('second'),'files','pdf'),'chunks','0')));
      await assertSucceeds(updateDoc(row(user('dm'),'files','pdf'),{archived:true,updatedAt:serverTimestamp()}));
      await assertFails(getDoc(doc(row(user('second'),'files','pdf'),'chunks','0')));
      await assertSucceeds(updateDoc(ref,{archived:false,updatedAt:serverTimestamp()}));
      await assertSucceeds(getDoc(doc(row(user('second'),'files','pdf'),'chunks','0')));
      await assertFails(setDoc(row(user('outsider'),'files','bad'),payload));
      await assertFails(setDoc(doc(user('player'),'campaigns','missing','files','pdf','chunks','0'),bytes));
    });
    it("accepts maximum bounded file chunks in one atomic upload", async () => {
      const db=user('player'),batch=writeBatch(db),ref=row(db,'files','large');
      batch.set(ref,{name:'map.png',title:'Map',contentType:'image/png',size:8388608,chunkCount:32,sha256:'b'.repeat(64),authorUid:'player',authorName:'player',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),archived:false});
      for(let i=0;i<32;i++)batch.set(doc(ref,'chunks',String(i)),{index:i,data:Bytes.fromUint8Array(new Uint8Array(262144))});
      await assertSucceeds(batch.commit());
      await assertSucceeds(getDoc(doc(row(user('dm'),'files','large'),'chunks','31')));
    },30000);
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
 it('saves a wizard without inheriting cleric data and prevents another player reading it',async()=>{await invite('other@example.test','other');await join('other','other');const data={...newCharacter('Wizard','player'),className:'Wizard',species:'Elf',customSpells:[{id:'mage-hand',name:'Mage Hand',level:0,prepared:true,description:'A spectral hand',concentration:false}]};await assertSucceeds(writeSheet(user('player'),{...sheet('player',1,data),type:'custom'}));await assertFails(getDoc(row(user('other'),'characters','hero')));await assertFails(getDoc(doc(row(user('other'),'characters','hero'),'details','state')));await assertSucceeds(getDoc(row(user('other'),'summaries','hero')));});
 it('rejects invalid custom spell payloads and false public class labels',async()=>{const data={...newCharacter('Wizard','player'),className:'Wizard'};const r={...sheet('player',1,data),type:'custom'};await assertFails(writeSheet(user('player'),r,{}, {className:'Bard'}));await assertFails(writeSheet(user('player'),{...r,data:{...data,customSpells:[{id:'bad',name:'bad',level:10,prepared:true,description:'',concentration:false}]}}));await assertFails(writeSheet(user('player'),{...r,data:{...data,features:'x'.repeat(20001)}}));});

    it('allows only DMs to reserve sheets and only the invited verified member to claim them',async()=>{
      const db=user('dm'), r={...sheet('admin'),pendingOwnerEmail:'player@example.test',updatedBy:'dm'};
      await assertFails(writeSheet(user('player'),{...sheet(),pendingOwnerEmail:'other@example.test'}));
      await assertSucceeds(writeSheet(db,r));
      await assertFails(getDoc(doc(row(user('player'),'characters','hero'),'details','state')));
      await assertSucceeds(getDocs(query(collection(user('player'),'campaigns','one','characters'),where('pendingOwnerEmail','==','player@example.test'))));
      const claim=(actor:string,change={})=>{const db=user(actor),batch=writeBatch(db);batch.update(row(db,'characters','hero'),{ownerUid:actor,pendingOwnerEmail:'',revision:2,updatedBy:actor,updatedAt:serverTimestamp(),...change});batch.set(row(db,'summaries','hero'),summary({...r,ownerUid:actor}));return batch.commit();};
      await assertFails(claim('player',{walletIndex:'forged'}));
      await invite('other@example.test','other');await join('other','other');await assertFails(claim('other'));
      await assertSucceeds(claim('player'));await assertSucceeds(getDoc(doc(row(user('player'),'characters','hero'),'details','state')));
      await assertFails(writeSheet(user('player'),{...sheet('player',3),pendingOwnerEmail:'other@example.test'}));
    });
    it('accepts a full bounded general spell library',async()=>{const data={...newCharacter('Wizard','player'),className:'Wizard',customSpells:Array.from({length:60},(_,i)=>({id:`spell-${i}`,name:`Spell ${i}`,level:i%10,prepared:false,description:'x'.repeat(2000),concentration:false}))};await assertSucceeds(writeSheet(user('player'),{...sheet('player',1,data),type:'custom'}));});

    it('allows a DM to rename only their own campaign',async()=>{await assertSucceeds(updateDoc(camp(user('dm')),{name:'New name',updatedAt:serverTimestamp()}));await assertFails(updateDoc(camp(user('player')),{name:'No',updatedAt:serverTimestamp()}));await bootstrap('other-dm','two');await assertFails(updateDoc(camp(user('dm'),'two'),{name:'No',updatedAt:serverTimestamp()}));});
    it('shares initiative but denies player and outsider writes',async()=>{const root={entryIndex:'a',activeId:'a',round:1,revision:1,updatedBy:'dm',updatedAt:serverTimestamp()},db=user('dm'),b=writeBatch(db);b.set(row(db,'combat','current'),root);b.set(doc(row(db,'combat','current'),'entries','a'),{id:'a',name:'Varen',initiative:15,order:0,conditions:''});await assertSucceeds(b.commit());await assertSucceeds(getDoc(row(user('player'),'combat','current')));await assertSucceeds(getDocs(collection(row(user('player'),'combat','current'),'entries')));await assertFails(getDoc(row(user('outsider'),'combat','current')));await assertFails(updateDoc(row(user('player'),'combat','current'),{round:2,revision:2,updatedBy:'player',updatedAt:serverTimestamp()}));await assertFails(updateDoc(row(db,'combat','current'),{round:2,revision:1,updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(row(db,'combat','current'),'entries','a'),{initiative:999}));});
    it('accepts forty combatants in one atomic save',async()=>{const db=user('dm'),b=writeBatch(db),ids=Array.from({length:40},(_,i)=>'entry-'+i);b.set(row(db,'combat','current'),{entryIndex:ids.join('/'),activeId:ids[0],round:1,revision:1,updatedBy:'dm',updatedAt:serverTimestamp()});ids.forEach((id,i)=>b.set(doc(row(db,'combat','current'),'entries',id),{id,name:'x'.repeat(100),initiative:i,order:i,conditions:'x'.repeat(200)}));await assertSucceeds(b.commit());});
    it('keeps verified party addresses private from other players',async()=>{await assertSucceeds(setDoc(row(user('player'),'contacts','player'),{name:'player',email:'player@example.test'}));await assertSucceeds(getDoc(row(user('dm'),'contacts','player')));await assertSucceeds(getDoc(row(user('player'),'contacts','player')));await assertFails(getDocs(collection(camp(user('player')),'contacts')));await assertFails(getDoc(row(user('outsider'),'contacts','player')));await assertFails(setDoc(row(user('player'),'contacts','player'),{name:'player',email:'fake@example.test'}));await assertFails(setDoc(row(user('dm'),'contacts','player'),{name:'player',email:'player@example.test'}));});
    it('allows admin backfill only from the member bound invitation',async()=>{await assertSucceeds(setDoc(row(admin(),'contacts','player'),{name:'player',email:'player@example.test'}));await assertFails(setDoc(row(admin(),'contacts','player'),{name:'player',email:'fake@example.test'}));await assertFails(setDoc(row(admin(),'contacts','outsider'),{name:'outsider',email:'outsider@example.test'}));});
    it('keeps scheduling drafts private and immutable',async()=>{const key='a'.repeat(32),data={id:key,title:'Next game',description:'',location:'',start:'2026-10-20T19:00',end:'2026-10-20T23:00',timeZone:'Asia/Jerusalem',attendees:['player@example.test'],organizerUid:'dm'};await assertSucceeds(setDoc(row(user('dm'),'sessionDrafts',key),data));await assertFails(getDoc(row(user('player'),'sessionDrafts',key)));await assertFails(setDoc(row(user('player'),'sessionDrafts','b'.repeat(32)),{...data,id:'b'.repeat(32),organizerUid:'player'}));await assertFails(updateDoc(row(user('dm'),'sessionDrafts',key),{title:'Edited'}));await assertFails(deleteDoc(row(user('dm'),'sessionDrafts',key)));});
    it('publishes session metadata while keeping recipient emails in the private draft',async()=>{const db=user('dm'),key='a'.repeat(32),draft={id:key,title:'Next game',description:'',location:'',start:'2026-10-20T19:00',end:'2026-10-20T23:00',timeZone:'Asia/Jerusalem',attendees:['player@example.test'],organizerUid:'dm'};await setDoc(row(db,'sessionDrafts',key),draft);const data={title:draft.title,description:'',location:'',timeZone:draft.timeZone,organizerUid:'dm',startAt:Timestamp.fromMillis(Date.now()+3600000),endAt:Timestamp.fromMillis(Date.now()+7200000),calendarUrl:'https://www.google.com/calendar/event?eid=example'};await assertFails(setDoc(row(db,'sessions',key),{...data,attendees:draft.attendees}));await assertFails(setDoc(row(db,'sessions',key),{...data,calendarUrl:'https://evil.example/'}));const b=writeBatch(db);b.set(row(db,'sessions',key),data);b.delete(row(db,'sessionDrafts',key));await assertSucceeds(b.commit());await assertSucceeds(getDoc(row(user('player'),'sessions',key)));await assertFails(getDoc(row(user('outsider'),'sessions',key)));await assertFails(updateDoc(row(user('player'),'sessions',key),{title:'No'}));});
    it('limits edits and cancellation to the original organizer, with a private immutable operation and atomic listing update',async()=>{
      const db=user('dm'),key='c'.repeat(32),draft={id:key,title:'Original',description:'',location:'',start:'2026-10-20T19:00',end:'2026-10-20T23:00',timeZone:'Asia/Jerusalem',attendees:['player@example.test'],organizerUid:'dm'};
      await setDoc(row(db,'sessionDrafts',key),draft);
      const original={title:draft.title,description:'',location:'',timeZone:draft.timeZone,organizerUid:'dm',startAt:Timestamp.fromMillis(Date.now()+3600000),endAt:Timestamp.fromMillis(Date.now()+7200000),calendarUrl:'https://www.google.com/calendar/event?eid=example'};
      const create=writeBatch(db);create.set(row(db,'sessions',key),original);create.delete(row(db,'sessionDrafts',key));await create.commit();
      const operation={draft:{...draft,title:'Updated'},etag:'"old"',revision:0,operationId:'d'.repeat(32),action:'edit'};
      await assertFails(setDoc(row(user('player'),'sessionChanges',key),{...operation,draft:{...operation.draft,organizerUid:'player'}}));
      await assertFails(setDoc(row(admin(),'sessionChanges',key),{...operation,draft:{...operation.draft,organizerUid:'admin'}}));
      await assertSucceeds(setDoc(row(db,'sessionChanges',key),operation));
      await assertFails(getDoc(row(user('player'),'sessionChanges',key)));
      await assertFails(updateDoc(row(db,'sessionChanges',key),{action:'cancel'}));
      await assertFails(updateDoc(row(db,'sessions',key),{title:'Updated',revision:1,status:'scheduled'}));
      const edited={...original,title:'Updated',revision:1,status:'scheduled'};
      const wrong=writeBatch(db);wrong.set(row(db,'sessions',key),{...edited,calendarUrl:'https://evil.test/'});wrong.delete(row(db,'sessionChanges',key));await assertFails(wrong.commit());
      const edit=writeBatch(db);edit.set(row(db,'sessions',key),edited);edit.delete(row(db,'sessionChanges',key));await assertSucceeds(edit.commit());
      await assertFails(setDoc(row(db,'sessionChanges',key),operation));
      await setDoc(row(db,'sessionChanges',key),{...operation,revision:1,action:'cancel'});
      const cancel=writeBatch(db);cancel.set(row(db,'sessions',key),{...edited,revision:2,status:'cancelled'});cancel.delete(row(db,'sessionChanges',key));await assertSucceeds(cancel.commit());
      expect((await getDoc(row(user('player'),'sessions',key))).data()?.status).toBe('cancelled');
      await assertFails(setDoc(row(db,'sessionChanges',key),{...operation,revision:2}));
      await assertFails(deleteDoc(row(db,'sessions',key)));
    });
    it('accepts fifty recipients and rejects invalid dates or excess recipients',async()=>{const key='a'.repeat(32),draft={id:key,title:'x'.repeat(150),description:'x'.repeat(2000),location:'x'.repeat(300),start:'2026-10-20T19:00',end:'2026-10-20T23:00',timeZone:'Asia/Jerusalem',attendees:Array.from({length:50},(_,i)=>`player${i}@example.test`),organizerUid:'dm'};await assertSucceeds(setDoc(row(user('dm'),'sessionDrafts',key),draft));const second='b'.repeat(32);await assertFails(setDoc(row(user('dm'),'sessionDrafts',second),{...draft,id:second,attendees:[{email:'player@example.test'}]}));await assertFails(setDoc(row(user('dm'),'sessionDrafts',second),{...draft,id:second,attendees:['x'.repeat(255)+'@example.test']}));await assertFails(setDoc(row(user('dm'),'sessionDrafts',second),{...draft,id:second,attendees:[...draft.attendees,'extra@example.test']}));await assertFails(setDoc(row(user('dm'),'sessionDrafts',second),{...draft,id:second,end:draft.start}));});
    it('lets assigned DMs include admin-invited players only in their own campaign',async()=>{const data={email:'future@example.test',role:'player',campaignName:'Test campaign',createdBy:'admin',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+3600000)};await setDoc(row(admin(),'invitations','future'),data);await assertSucceeds(getDoc(row(user('dm'),'invitations','future')));await assertSucceeds(getDocs(query(collection(camp(user('dm')),'invitations'),where('role','==','player'))));await assertFails(getDoc(row(user('outsider'),'invitations','future')));await bootstrap('other-dm','two');await assertFails(getDoc(row(user('other-dm'),'invitations','future')));});
  },
);
