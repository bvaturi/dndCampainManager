// Firestore security-rules tests. Run with: npm run test:rules (starts the emulator).
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import {
  collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'

const ADMIN = { uid: 'admin', email: 'barakvaturi@gmail.com' }
const DM = { uid: 'dm', email: 'dm@example.com' }
const P1 = { uid: 'p1', email: 'p1@example.com' }
const P2 = { uid: 'p2', email: 'p2@example.com' }
const STRANGER = { uid: 'x', email: 'x@example.com' }

let env
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore()

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'codex-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
after(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'campaigns/c1'), { name: 'Lost Mine', dmEmail: DM.email, dmName: 'Dana', createdBy: ADMIN.email, status: 'active', createdAt: 1 })
    await setDoc(doc(db, 'campaigns/c1/invites/tok'), { campaignId: 'c1', email: null, revoked: false, expiresAt: Date.now() + 86400000, uses: 0 })
    await setDoc(doc(db, 'campaigns/c1/invites/old'), { campaignId: 'c1', email: null, revoked: false, expiresAt: Date.now() - 1000, uses: 0 })
    await setDoc(doc(db, 'campaigns/c1/invites/p2only'), { campaignId: 'c1', email: P2.email, revoked: false, expiresAt: Date.now() + 86400000, uses: 0 })
    await setDoc(doc(db, 'campaigns/c1/members/p1'), { uid: 'p1', inviteToken: 'tok' })
    await setDoc(doc(db, 'campaigns/c1/characters/ch1'), { ownerUid: 'p1', campaignId: 'c1', name: 'Thorin', hpCurrent: 10 })
  })
})

const join = (u, token) => {
  const db = as(u)
  const b = writeBatch(db)
  b.set(doc(db, `campaigns/c1/members/${u.uid}`), { uid: u.uid, inviteToken: token })
  b.update(doc(db, `campaigns/c1/invites/${token}`), { uses: increment(1) })
  return b.commit()
}

test('only the platform manager creates campaigns', async () => {
  await assertSucceeds(setDoc(doc(as(ADMIN), 'campaigns/c2'), { name: 'x', dmEmail: DM.email, createdBy: ADMIN.email }))
  await assertFails(setDoc(doc(as(DM), 'campaigns/c3'), { name: 'x', dmEmail: DM.email, createdBy: DM.email }))
})

test('DM sees and edits their campaign but cannot reassign it', async () => {
  await assertSucceeds(getDocs(query(collection(as(DM), 'campaigns'), where('dmEmail', '==', DM.email))))
  await assertSucceeds(updateDoc(doc(as(DM), 'campaigns/c1'), { status: 'paused' }))
  await assertFails(updateDoc(doc(as(DM), 'campaigns/c1'), { dmEmail: 'other@example.com' }))
  await assertFails(getDoc(doc(as(STRANGER), 'campaigns/c1')))
})

test('a player joins with a valid invite', async () => {
  await assertSucceeds(getDoc(doc(as(P2), 'campaigns/c1/invites/tok')))
  await assertSucceeds(join(P2, 'tok'))
  await assertSucceeds(getDoc(doc(as(P2), 'campaigns/c1')))
})

test('expired, wrong-email and forged invites are rejected', async () => {
  await assertFails(join(P2, 'old'))
  await assertFails(join(STRANGER, 'p2only'))
  await assertFails(setDoc(doc(as(STRANGER), 'campaigns/c1/members/x'), { uid: 'x', inviteToken: 'nope' }))
  await assertSucceeds(join(P2, 'p2only'))
})

test('only the DM lists and creates invites', async () => {
  await assertSucceeds(getDocs(collection(as(DM), 'campaigns/c1/invites')))
  await assertFails(getDocs(collection(as(P1), 'campaigns/c1/invites')))
  await assertFails(setDoc(doc(as(P1), 'campaigns/c1/invites/mine'), { campaignId: 'c1', revoked: false, expiresAt: Date.now() + 1e6, uses: 0, email: null }))
})

test('characters: owner and DM edit, party views, strangers blocked', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' }))
  await assertSucceeds(updateDoc(doc(as(P1), 'campaigns/c1/characters/ch1'), { hpCurrent: 5 }))
  await assertSucceeds(updateDoc(doc(as(DM), 'campaigns/c1/characters/ch1'), { hpCurrent: 7 }))
  await assertSucceeds(getDoc(doc(as(P2), 'campaigns/c1/characters/ch1')))
  await assertFails(updateDoc(doc(as(P2), 'campaigns/c1/characters/ch1'), { hpCurrent: 0 }))
  await assertFails(getDoc(doc(as(STRANGER), 'campaigns/c1/characters/ch1')))
  await assertFails(updateDoc(doc(as(P1), 'campaigns/c1/characters/ch1'), { ownerUid: 'p2' }))
  await assertSucceeds(setDoc(doc(as(P2), 'campaigns/c1/characters/ch2'), { ownerUid: 'p2', campaignId: 'c1', name: 'Lia' }))
  await assertFails(setDoc(doc(as(STRANGER), 'campaigns/c1/characters/ch3'), { ownerUid: 'x', campaignId: 'c1', name: 'Nope' }))
})

test('collection-group queries for my campaigns / my characters / all characters', async () => {
  await assertSucceeds(getDocs(query(collectionGroup(as(P1), 'members'), where('uid', '==', 'p1'))))
  await assertSucceeds(getDocs(query(collectionGroup(as(P1), 'characters'), where('ownerUid', '==', 'p1'))))
  await assertSucceeds(getDocs(collectionGroup(as(ADMIN), 'characters')))
  await assertFails(getDocs(collectionGroup(as(P1), 'characters')))
})

test('DM notes are private to DM and manager', async () => {
  await assertSucceeds(setDoc(doc(as(DM), 'campaigns/c1/private/notes'), { text: 'the butler did it' }))
  await assertFails(getDoc(doc(as(P1), 'campaigns/c1/private/notes')))
  await assertSucceeds(getDoc(doc(as(ADMIN), 'campaigns/c1/private/notes')))
})

// ------------------------------------------------------------------ one player vs. another player's character
test('another player cannot change, take over or delete my character in any way', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' }))
  const p2 = as(P2)
  const mine = doc(p2, 'campaigns/c1/characters/ch1')
  // every kind of edit to P1's character
  for (const patch of [
    { hpCurrent: 0 }, { name: 'Hacked' }, { level: 20 }, { abilities: { str: 30 } },
    { spells: [{ id: 'wish', prepared: true }] }, { feats: [{ uid: 'x', featId: 'lucky', level: 1, notes: '' }] },
    { tabs: [{ id: 't', title: 'Mine now', content: '' }] }, { inspiration: true },
  ]) await assertFails(updateDoc(mine, patch))
  await assertFails(updateDoc(mine, { ownerUid: 'p2' }), 'cannot take ownership')
  await assertFails(setDoc(mine, { ownerUid: 'p2', campaignId: 'c1', name: 'Overwritten' }), 'cannot overwrite the whole document')
  await assertFails(deleteDoc(mine), 'cannot delete it')
  await assertFails(setDoc(doc(p2, 'campaigns/c1/characters/fake'), { ownerUid: 'p1', campaignId: 'c1', name: 'Forged' }), 'cannot create a character in my name')
  // ...but can still read it (the party sees each other's sheets) and edit their own
  await assertSucceeds(getDoc(mine))
  await assertSucceeds(setDoc(doc(p2, 'campaigns/c1/characters/ch2'), { ownerUid: 'p2', campaignId: 'c1', name: 'Lia' }))
  await assertSucceeds(updateDoc(doc(p2, 'campaigns/c1/characters/ch2'), { feats: [], tabs: [{ id: 't', title: 'Loot', content: '' }] }))
  // the owner can edit everything on their own sheet
  await assertSucceeds(updateDoc(doc(as(P1), 'campaigns/c1/characters/ch1'), { hpCurrent: 3, feats: [], tabs: [] }))
})

test('another player cannot promote themselves to get edit rights', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' }))
  const p2 = as(P2)
  await assertFails(updateDoc(doc(p2, 'campaigns/c1'), { dmEmail: P2.email }), 'cannot make themselves DM')
  await assertFails(setDoc(doc(p2, 'admins/p2@example.com'), { addedAt: 1 }), 'cannot make themselves manager')
  await assertFails(setDoc(doc(p2, 'campaigns/c1/members/p1'), { uid: 'p1', inviteToken: 'tok' }), 'cannot write another member')
  await assertFails(deleteDoc(doc(p2, 'campaigns/c1/members/p1')), 'cannot kick another player')
  await assertFails(setDoc(doc(p2, 'campaigns/c1/invites/mine'), { campaignId: 'c1', revoked: false, expiresAt: Date.now() + 1e6, uses: 0, email: null }))
  await assertFails(setDoc(doc(p2, 'users/p1'), { displayName: 'Hacked' }), 'cannot edit another user profile')
})

test('a removed player can no longer edit their old character', async () => {
  await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'campaigns/c1/members/p1')))
  await assertFails(updateDoc(doc(as(P1), 'campaigns/c1/characters/ch1'), { hpCurrent: 1 }))
  await assertFails(deleteDoc(doc(as(P1), 'campaigns/c1/characters/ch1')))
  await assertSucceeds(updateDoc(doc(as(DM), 'campaigns/c1/characters/ch1'), { hpCurrent: 1 }), 'the DM still can')
})

test('an unverified account using the DM email gets no DM rights', async () => {
  const fake = env.authenticatedContext('impostor', { email: DM.email, email_verified: false }).firestore()
  await assertFails(updateDoc(doc(fake, 'campaigns/c1/characters/ch1'), { hpCurrent: 0 }))
  await assertFails(getDocs(collection(fake, 'campaigns/c1/invites')))
})

// ------------------------------------------------------------------ combat manager
test('combat: players roll only for their own character; enemies and turns are the DM\'s', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' })
    await setDoc(doc(db, 'campaigns/c1/characters/ch2'), { ownerUid: 'p2', campaignId: 'c1', name: 'Lia' })
  })
  const dm = as(DM)
  const p1 = as(P1)
  const p2 = as(P2)
  const pc = (owner, extra = {}) => ({ kind: 'pc', name: 'x', initiative: null, roll: null, dexMod: 2, hidden: false, conditions: [], ownerUid: owner, createdAt: 1, ...extra })

  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/combat/state'), { active: true, name: 'Ambush', round: 1, turnId: null, startedAt: 1 }))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/combat/state'), { active: true, name: 'mine', round: 9, turnId: 'ch1', startedAt: 1 }), 'players cannot run turns')
  await assertSucceeds(getDoc(doc(p1, 'campaigns/c1/combat/state')))

  // players add and roll for their own character only
  await assertSucceeds(setDoc(doc(p1, 'campaigns/c1/combatants/ch1'), pc('p1')))
  await assertSucceeds(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { initiative: 17, roll: { dice: [15], kept: 0, parts: [] } }))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/combatants/ch2'), pc('p1')), 'cannot enter for another player\'s character')
  await assertFails(setDoc(doc(p2, 'campaigns/c1/combatants/ch1'), pc('p2')), 'cannot claim my character')
  await assertFails(updateDoc(doc(p2, 'campaigns/c1/combatants/ch1'), { initiative: 1 }), 'cannot change my roll')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { conditions: ['invisible'] }), 'conditions are the DM\'s')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { hidden: true }))
  await assertFails(deleteDoc(doc(p1, 'campaigns/c1/combatants/ch1')))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/combatants/orc'), { ...pc('p1'), kind: 'enemy' }), 'players cannot add enemies')

  // the DM adds enemies, hidden ones stay invisible, secrets are DM-only
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/combatants/goblin'), { ...pc(null), kind: 'enemy', name: 'Goblin', status: 'healthy' }))
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/combatants/boss'), { ...pc(null), kind: 'enemy', name: 'Hidden boss', hidden: true }))
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/combatSecrets/goblin'), { hp: 7, hpMax: 7, ac: 15, initBonus: 2, notes: '' }))
  await assertSucceeds(updateDoc(doc(dm, 'campaigns/c1/combatants/ch1'), { conditions: ['prone'], initiative: 12 }), 'DM can adjust a player too')
  await assertSucceeds(getDocs(query(collection(p1, 'campaigns/c1/combatants'), where('hidden', '==', false))))
  await assertFails(getDocs(collection(p1, 'campaigns/c1/combatants')), 'an unfiltered list could reveal hidden enemies')
  await assertFails(getDoc(doc(p1, 'campaigns/c1/combatants/boss')))
  await assertFails(getDoc(doc(p1, 'campaigns/c1/combatSecrets/goblin')), 'enemy HP is secret')
  await assertFails(getDoc(doc(as(STRANGER), 'campaigns/c1/combat/state')))
})

// ------------------------------------------------------------------ battle map
test('battle map: only the DM manages maps; players see only the map on the table', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' }))
  const dm = as(DM)
  const p1 = as(P1)
  const map = { name: 'Cave', thumb: 'data:image/jpeg;base64,AA', width: 1600, height: 1200, cols: 20, rows: 15, offsetX: 0, offsetY: 0, gridOpacity: 0.5, gridColor: 'dark', createdAt: 1 }

  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/maps/cave'), map))
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/mapImages/cave'), { image: 'data:image/webp;base64,AA' }))
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/maps/secret'), { ...map, name: 'Dragon lair (later)' }))
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/mapImages/secret'), { image: 'data:image/webp;base64,AA' }))
  await assertSucceeds(setDoc(doc(as(ADMIN), 'campaigns/c1/maps/admin'), map), 'the platform manager can too')
  await assertSucceeds(getDocs(collection(dm, 'campaigns/c1/maps')))

  // nothing on the table yet: players see no map at all
  await assertFails(getDoc(doc(p1, 'campaigns/c1/maps/cave')))
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/combat/map'), { mapId: 'cave', playersMove: true }))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/combat/map'), { mapId: 'secret', playersMove: true }), 'players cannot change what is shown')

  // the map on the table is readable by members, the rest of the library is not
  await assertSucceeds(getDoc(doc(p1, 'campaigns/c1/maps/cave')))
  await assertSucceeds(getDoc(doc(p1, 'campaigns/c1/mapImages/cave')))
  await assertSucceeds(getDoc(doc(p1, 'campaigns/c1/combat/map')))
  await assertFails(getDoc(doc(p1, 'campaigns/c1/maps/secret')), 'maps prepared for later stay secret')
  await assertFails(getDoc(doc(p1, 'campaigns/c1/mapImages/secret')))
  await assertFails(getDocs(collection(p1, 'campaigns/c1/maps')), 'players cannot list the library')
  await assertFails(getDoc(doc(as(STRANGER), 'campaigns/c1/maps/cave')))
  await assertFails(getDoc(doc(as(STRANGER), 'campaigns/c1/mapImages/cave')))

  // players cannot change maps or the grid
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/maps/cave'), { cols: 5 }))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/maps/mine'), map))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/mapImages/cave'), { image: 'data:image/webp;base64,BB' }))
  await assertFails(deleteDoc(doc(p1, 'campaigns/c1/maps/cave')))
  await assertSucceeds(updateDoc(doc(dm, 'campaigns/c1/maps/cave'), { cols: 24, rows: 18, gridOpacity: 0.3 }))
  await assertSucceeds(deleteDoc(doc(dm, 'campaigns/c1/maps/secret')))
  await assertSucceeds(deleteDoc(doc(dm, 'campaigns/c1/mapImages/secret')))
})

test('battle map tokens: the DM places everyone; a player moves only their own token, and only when allowed', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' })
    await setDoc(doc(db, 'campaigns/c1/combat/map'), { mapId: 'cave', playersMove: true })
    const base = { initiative: 10, roll: null, dexMod: 0, hidden: false, conditions: [], createdAt: 1 }
    await setDoc(doc(db, 'campaigns/c1/combatants/ch1'), { ...base, kind: 'pc', name: 'Thorin', ownerUid: 'p1' })
    await setDoc(doc(db, 'campaigns/c1/combatants/ch2'), { ...base, kind: 'pc', name: 'Lia', ownerUid: 'p2' })
    await setDoc(doc(db, 'campaigns/c1/combatants/goblin'), { ...base, kind: 'enemy', name: 'Goblin' })
    await setDoc(doc(db, 'campaigns/c1/combatants/boss'), { ...base, kind: 'enemy', name: 'Boss', hidden: true, mapPos: { mapId: 'cave', x: 9, y: 9 } })
  })
  const dm = as(DM)
  const p1 = as(P1)
  const at = (x, y, mapId = 'cave') => ({ mapPos: { mapId, x, y } })

  await assertSucceeds(updateDoc(doc(dm, 'campaigns/c1/combatants/goblin'), at(5, 5)))
  await assertSucceeds(updateDoc(doc(dm, 'campaigns/c1/combatants/ch2'), at(1, 1)), 'the DM can move a player')
  await assertSucceeds(updateDoc(doc(dm, 'campaigns/c1/combatants/ch2'), { mapPos: null }), 'and take a token off the map')

  await assertSucceeds(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), at(2, 3)), 'a player moves their own token')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch2'), at(4, 4)), 'not another player\'s token')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/goblin'), at(0, 0)), 'not an enemy')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), at(2, 3, 'secret')), 'only on the map on the table')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { mapPos: { mapId: 'cave', x: 1, y: 1, extra: true } }))
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { ...at(1, 1), conditions: [] , hidden: true }), 'moving does not unlock other fields')
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { mapPos: null }), 'only the DM removes tokens')
  await assertFails(getDoc(doc(p1, 'campaigns/c1/combatants/boss')), 'a hidden enemy\'s token stays hidden')

  // the DM can lock token movement
  await assertSucceeds(setDoc(doc(dm, 'campaigns/c1/combat/map'), { mapId: 'cave', playersMove: false }))
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), at(6, 6)), 'movement locked by the DM')
  await assertSucceeds(updateDoc(doc(p1, 'campaigns/c1/combatants/ch1'), { initiative: 14 }), 'initiative rolls still work')
})

// ---- homebrew library
const hb = (over = {}) => ({
  kind: 'spell', status: 'pending', campaignId: 'c1', createdBy: 'p1', createdByName: 'Noa', createdAt: 1,
  name: 'Spark', desc: '', grantedTo: [], level: 1, school: 'evocation', classes: ['wizard'], ...over,
})

test('homebrew: the DM curates; the party sees only approved items (and their own suggestions)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' })
    await setDoc(doc(db, 'campaigns/c1/homebrew/hb-ok'), hb({ status: 'approved', createdBy: 'dm' }))
    await setDoc(doc(db, 'campaigns/c1/homebrew/hb-p2'), hb({ createdBy: 'p2' }))
  })
  await assertSucceeds(setDoc(doc(as(DM), 'campaigns/c1/homebrew/hb-dm'), hb({ status: 'approved', createdBy: 'dm', grantedTo: ['ch1'] })))
  await assertSucceeds(getDocs(collection(as(DM), 'campaigns/c1/homebrew')))
  // players: approved list and their own, never the whole collection or someone else's suggestion
  await assertSucceeds(getDocs(query(collection(as(P1), 'campaigns/c1/homebrew'), where('status', '==', 'approved'))))
  await assertSucceeds(getDocs(query(collection(as(P1), 'campaigns/c1/homebrew'), where('createdBy', '==', 'p1'))))
  await assertFails(getDocs(collection(as(P1), 'campaigns/c1/homebrew')))
  await assertFails(getDoc(doc(as(P1), 'campaigns/c1/homebrew/hb-p2')))
  await assertSucceeds(getDoc(doc(as(P2), 'campaigns/c1/homebrew/hb-p2')))
  await assertFails(getDocs(query(collection(as(STRANGER), 'campaigns/c1/homebrew'), where('status', '==', 'approved'))))
  // players cannot change approved items
  await assertFails(updateDoc(doc(as(P1), 'campaigns/c1/homebrew/hb-ok'), { name: 'Mine now' }))
  await assertFails(deleteDoc(doc(as(P1), 'campaigns/c1/homebrew/hb-ok')))
})

test('homebrew: players suggest pending items for their own character only', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'campaigns/c1/members/p2'), { uid: 'p2', inviteToken: 'tok' })
  })
  const p1 = as(P1)
  await assertSucceeds(setDoc(doc(p1, 'campaigns/c1/homebrew/hb-s1'), hb({ grantedTo: ['ch1'] })))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/homebrew/hb-s2'), hb({ status: 'approved' })), 'cannot self-approve')
  await assertFails(setDoc(doc(p1, 'campaigns/c1/homebrew/hb-s3'), hb({ createdBy: 'p2' })), 'cannot pose as another player')
  await assertFails(setDoc(doc(as(P2), 'campaigns/c1/homebrew/hb-s4'), hb({ createdBy: 'p2', grantedTo: ['ch1'] })), "not for someone else's character")
  await assertFails(setDoc(doc(p1, 'campaigns/c1/homebrew/hb-s5'), hb({ grantedTo: ['ch1', 'ch2'] })))
  await assertFails(setDoc(doc(p1, 'campaigns/c1/homebrew/sneaky'), hb()), 'ids start with hb-')
  await assertFails(setDoc(doc(as(STRANGER), 'campaigns/c1/homebrew/hb-x'), hb({ createdBy: 'x' })))
  // edit / withdraw while pending, but not approve
  await assertSucceeds(updateDoc(doc(p1, 'campaigns/c1/homebrew/hb-s1'), { name: 'Bigger Spark' }))
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/homebrew/hb-s1'), { status: 'approved' }))
  await assertFails(updateDoc(doc(as(P2), 'campaigns/c1/homebrew/hb-s1'), { name: 'Hijack' }))
  // the DM approves; after that the player can no longer change or withdraw it
  await assertSucceeds(updateDoc(doc(as(DM), 'campaigns/c1/homebrew/hb-s1'), { status: 'approved' }))
  await assertFails(updateDoc(doc(p1, 'campaigns/c1/homebrew/hb-s1'), { name: 'Even Bigger' }))
  await assertFails(deleteDoc(doc(p1, 'campaigns/c1/homebrew/hb-s1')))
  await assertSucceeds(setDoc(doc(p1, 'campaigns/c1/homebrew/hb-s6'), hb()))
  await assertSucceeds(deleteDoc(doc(p1, 'campaigns/c1/homebrew/hb-s6')))
})
