import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut as fbSignOut,
} from 'firebase/auth'
import {
  addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, getFirestore,
  increment, onSnapshot, orderBy, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { BOOTSTRAP_ADMINS, inviteProblem, randomToken, type Backend } from './backend'
import type {
  BattleMap, Campaign, Character, Combatant, CombatSnapshot, CombatState, DungeonMaster, EnemySecret, Homebrew, Invite, MapState, MapView,
  Member, SessionLog, UserProfile,
} from './types'

export function createFirebaseBackend(): Backend {
  const env = import.meta.env
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  const auth = getAuth(app)
  const db = getFirestore(app)

  const withId = <T>(snap: { id: string; data(): unknown }) => ({ ...(snap.data() as object), id: snap.id }) as T
  const all = async <T>(q: Parameters<typeof getDocs>[0]) => (await getDocs(q)).docs.map((d) => withId<T>(d))
  const campaignsByIds = async (ids: string[]) => {
    const docs = await Promise.all([...new Set(ids)].map((id) => getDoc(doc(db, 'campaigns', id))))
    return docs.filter((d) => d.exists()).map((d) => withId<Campaign>(d))
  }

  return {
    kind: 'firebase',
    onAuthChange(cb) {
      return onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase(), displayName: u.displayName || u.email || '', photoURL: u.photoURL || undefined } : null))
    },
    async signIn() {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    },
    signOut: () => fbSignOut(auth),

    async touchProfile(user) {
      await setDoc(doc(db, 'users', user.uid), { ...user, photoURL: user.photoURL || '', lastSeen: Date.now() }, { merge: true })
    },
    listUsers: () => all<UserProfile>(collection(db, 'users')),
    async listAdmins() {
      const extra = (await getDocs(collection(db, 'admins'))).docs.map((d) => d.id)
      return [...new Set([...BOOTSTRAP_ADMINS, ...extra])]
    },
    addAdmin: (email) => setDoc(doc(db, 'admins', email.toLowerCase()), { addedAt: Date.now() }),
    removeAdmin: (email) => deleteDoc(doc(db, 'admins', email.toLowerCase())),
    async isAdmin(user) {
      if (BOOTSTRAP_ADMINS.includes(user.email)) return true
      return (await getDoc(doc(db, 'admins', user.email))).exists()
    },

    listDms: () => all<DungeonMaster>(collection(db, 'dms')),
    saveDm: (dm) => setDoc(doc(db, 'dms', dm.email.toLowerCase()), { ...dm, email: dm.email.toLowerCase() }),
    removeDm: (email) => deleteDoc(doc(db, 'dms', email)),

    listAllCampaigns: () => all<Campaign>(query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'))),
    listCampaignsAsDm: (email) => all<Campaign>(query(collection(db, 'campaigns'), where('dmEmail', '==', email))),
    async listCampaignsAsPlayer(uid) {
      const snaps = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)))
      return campaignsByIds(snaps.docs.map((d) => d.ref.parent.parent!.id))
    },
    async getCampaign(id) {
      const s = await getDoc(doc(db, 'campaigns', id))
      return s.exists() ? withId<Campaign>(s) : null
    },
    async createCampaign(c) {
      const ref = await addDoc(collection(db, 'campaigns'), { ...c, dmEmail: c.dmEmail.toLowerCase(), createdAt: Date.now() })
      return ref.id
    },
    updateCampaign: (id, patch) => updateDoc(doc(db, 'campaigns', id), patch),
    async deleteCampaign(id) {
      // Client SDKs cannot delete recursively, so clear the subcollections first.
      for (const sub of ['members', 'characters', 'sessions', 'invites', 'private', 'combat', 'combatants', 'combatSecrets', 'maps', 'mapImages']) {
        const snaps = await getDocs(collection(db, 'campaigns', id, sub))
        await Promise.all(snaps.docs.map((d) => deleteDoc(d.ref)))
      }
      await deleteDoc(doc(db, 'campaigns', id))
    },
    async getDmNotes(cid) {
      const s = await getDoc(doc(db, 'campaigns', cid, 'private', 'notes'))
      return s.exists() ? (s.data().text as string) : ''
    },
    saveDmNotes: (cid, text) => setDoc(doc(db, 'campaigns', cid, 'private', 'notes'), { text }),

    async createInvite(inv) {
      const token = randomToken()
      await setDoc(doc(db, 'campaigns', inv.campaignId, 'invites', token), { ...inv, email: inv.email?.toLowerCase() || null, createdAt: Date.now(), uses: 0, revoked: false })
      return token
    },
    async listInvites(cid) {
      return (await all<Invite & { id: string }>(collection(db, 'campaigns', cid, 'invites'))).map((i) => ({ ...i, token: i.id }))
    },
    async getInvite(cid, token) {
      const s = await getDoc(doc(db, 'campaigns', cid, 'invites', token))
      return s.exists() ? ({ ...(s.data() as Invite), token }) : null
    },
    revokeInvite: (cid, token) => updateDoc(doc(db, 'campaigns', cid, 'invites', token), { revoked: true }),
    async acceptInvite(cid, token, user) {
      const inv = await this.getInvite(cid, token)
      const problem = inviteProblem(inv, user)
      if (problem) throw new Error(problem)
      const memberRef = doc(db, 'campaigns', cid, 'members', user.uid)
      if ((await getDoc(memberRef).catch(() => null))?.exists()) return
      const batch = writeBatch(db)
      const member: Member = {
        uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL || '',
        inviteToken: token, joinedAt: Date.now(),
      }
      batch.set(memberRef, member)
      batch.update(doc(db, 'campaigns', cid, 'invites', token), { uses: increment(1) })
      await batch.commit()
    },

    listMembers: (cid) => all<Member>(collection(db, 'campaigns', cid, 'members')),
    removeMember: (cid, uid) => deleteDoc(doc(db, 'campaigns', cid, 'members', uid)),

    listSessions: (cid) => all<SessionLog>(query(collection(db, 'campaigns', cid, 'sessions'), orderBy('number', 'desc'))),
    async saveSession(cid, s) {
      const { id, ...data } = s
      if (id) await updateDoc(doc(db, 'campaigns', cid, 'sessions', id), data)
      else await addDoc(collection(db, 'campaigns', cid, 'sessions'), { ...data, createdAt: Date.now() })
    },
    deleteSession: (cid, id) => deleteDoc(doc(db, 'campaigns', cid, 'sessions', id)),

    listCharacters: (cid) => all<Character>(collection(db, 'campaigns', cid, 'characters')),
    listMyCharacters: (uid) => all<Character>(query(collectionGroup(db, 'characters'), where('ownerUid', '==', uid))),
    listAllCharacters: () => all<Character>(collectionGroup(db, 'characters')),
    async getCharacter(cid, id) {
      const s = await getDoc(doc(db, 'campaigns', cid, 'characters', id))
      return s.exists() ? withId<Character>(s) : null
    },
    async createCharacter(c) {
      const now = Date.now()
      const ref = await addDoc(collection(db, 'campaigns', c.campaignId, 'characters'), { ...c, createdAt: now, updatedAt: now })
      return ref.id
    },
    updateCharacter: (cid, id, patch) =>
      updateDoc(doc(db, 'campaigns', cid, 'characters', id), { ...patch, updatedAt: Date.now() }),
    deleteCharacter: (cid, id) => deleteDoc(doc(db, 'campaigns', cid, 'characters', id)),

    watchCombat(cid, asDm, cb, onError) {
      const snap: CombatSnapshot = { state: null, combatants: [], secrets: {} }
      const emit = () => cb({ ...snap, combatants: [...snap.combatants], secrets: { ...snap.secrets } })
      const fail = (e: Error) => onError?.(e)
      const unsubs = [
        onSnapshot(doc(db, 'campaigns', cid, 'combat', 'state'), (d) => {
          snap.state = d.exists() ? (d.data() as CombatState) : null
          emit()
        }, fail),
        onSnapshot(
          asDm ? collection(db, 'campaigns', cid, 'combatants') : query(collection(db, 'campaigns', cid, 'combatants'), where('hidden', '==', false)),
          (q) => { snap.combatants = q.docs.map((d) => withId<Combatant>(d)); emit() },
          fail,
        ),
      ]
      if (asDm) {
        unsubs.push(onSnapshot(collection(db, 'campaigns', cid, 'combatSecrets'), (q) => {
          snap.secrets = Object.fromEntries(q.docs.map((d) => [d.id, d.data() as EnemySecret]))
          emit()
        }, fail))
      }
      return () => unsubs.forEach((u) => u())
    },
    watchCharacters(cid, cb, onError) {
      return onSnapshot(collection(db, 'campaigns', cid, 'characters'), (q) => cb(q.docs.map((d) => withId<Character>(d))), (e) => onError?.(e))
    },
    saveCombatState: (cid, state) => setDoc(doc(db, 'campaigns', cid, 'combat', 'state'), state),
    async saveCombatant(cid, c) {
      const { id, ...data } = c
      await setDoc(doc(db, 'campaigns', cid, 'combatants', id), data)
    },
    updateCombatant: (cid, id, patch) => updateDoc(doc(db, 'campaigns', cid, 'combatants', id), patch),
    async removeCombatant(cid, id) {
      await deleteDoc(doc(db, 'campaigns', cid, 'combatants', id))
      await deleteDoc(doc(db, 'campaigns', cid, 'combatSecrets', id))
    },
    saveEnemySecret: (cid, id, secret) => setDoc(doc(db, 'campaigns', cid, 'combatSecrets', id), secret),
    async clearCombat(cid) {
      for (const sub of ['combatants', 'combatSecrets']) {
        const q = await getDocs(collection(db, 'campaigns', cid, sub))
        await Promise.all(q.docs.map((d) => deleteDoc(d.ref)))
      }
      await setDoc(doc(db, 'campaigns', cid, 'combat', 'state'), { active: false, name: '', round: 0, turnId: null, startedAt: 0 })
    },

    watchHomebrew(cid, opts, cb, onError) {
      const col = collection(db, 'campaigns', cid, 'homebrew')
      const sort = (list: Homebrew[]) => list.sort((a, b) => a.name.localeCompare(b.name))
      if (opts.all) return onSnapshot(col, (q) => cb(sort(q.docs.map((d) => withId<Homebrew>(d)))), (e) => onError?.(e))
      // Players may read approved items and their own suggestions: two queries the rules can check, merged.
      let approved: Homebrew[] = []
      let mine: Homebrew[] = []
      const emit = () => cb(sort([...approved, ...mine.filter((m) => !approved.some((a) => a.id === m.id))]))
      const offs = [onSnapshot(query(col, where('status', '==', 'approved')), (q) => { approved = q.docs.map((d) => withId<Homebrew>(d)); emit() }, (e) => onError?.(e))]
      if (opts.uid) offs.push(onSnapshot(query(col, where('createdBy', '==', opts.uid)), (q) => { mine = q.docs.map((d) => withId<Homebrew>(d)); emit() }, (e) => onError?.(e)))
      return () => offs.forEach((off) => off())
    },
    async saveHomebrew(cid, item) {
      const { id, ...data } = item
      // Firestore rejects undefined fields.
      await setDoc(doc(db, 'campaigns', cid, 'homebrew', id), JSON.parse(JSON.stringify(data)))
    },
    deleteHomebrew: (cid, id) => deleteDoc(doc(db, 'campaigns', cid, 'homebrew', id)),

    watchMaps(cid, cb, onError) {
      return onSnapshot(query(collection(db, 'campaigns', cid, 'maps'), orderBy('createdAt', 'desc')),
        (q) => cb(q.docs.map((d) => withId<BattleMap>(d))), (e) => onError?.(e))
    },
    async getMapImage(cid, id) {
      const s = await getDoc(doc(db, 'campaigns', cid, 'mapImages', id))
      return s.exists() ? (s.data().image as string) : null
    },
    async createMap(cid, map, image) {
      const ref = doc(collection(db, 'campaigns', cid, 'maps'))
      const batch = writeBatch(db)
      batch.set(ref, { ...map, createdAt: Date.now() })
      batch.set(doc(db, 'campaigns', cid, 'mapImages', ref.id), { image })
      await batch.commit()
      return ref.id
    },
    updateMap: (cid, id, patch) => updateDoc(doc(db, 'campaigns', cid, 'maps', id), patch),
    async deleteMap(cid, id) {
      // Take it off the table first, so players stop listening before the docs go.
      const stateRef = doc(db, 'campaigns', cid, 'combat', 'map')
      const state = await getDoc(stateRef)
      if (state.exists() && state.data().mapId === id) await updateDoc(stateRef, { mapId: null })
      const batch = writeBatch(db)
      batch.delete(doc(db, 'campaigns', cid, 'maps', id))
      batch.delete(doc(db, 'campaigns', cid, 'mapImages', id))
      await batch.commit()
    },
    saveMapState: (cid, state) => setDoc(doc(db, 'campaigns', cid, 'combat', 'map'), state),
    watchMap(cid, cb, onError) {
      const view: MapView = { state: null, map: null, image: null }
      const emit = () => cb({ ...view })
      let current: string | null = null
      let inner: (() => void)[] = []
      const stopInner = () => { inner.forEach((u) => u()); inner = [] }
      const outer = onSnapshot(doc(db, 'campaigns', cid, 'combat', 'map'), (d) => {
        view.state = d.exists() ? (d.data() as MapState) : null
        const id = view.state?.mapId ?? null
        if (id !== current) {
          stopInner()
          current = id
          view.map = null
          view.image = null
          if (id) {
            // Players may read only the map on the table; ignore errors from one that was just swapped out.
            const fail = (e: Error) => { if (current === id) onError?.(e) }
            inner = [
              onSnapshot(doc(db, 'campaigns', cid, 'maps', id), (m) => {
                if (current !== id) return
                view.map = m.exists() ? withId<BattleMap>(m) : null
                emit()
              }, fail),
              onSnapshot(doc(db, 'campaigns', cid, 'mapImages', id), (m) => {
                if (current !== id) return
                view.image = m.exists() ? (m.data().image as string) : null
                emit()
              }, fail),
            ]
          }
        }
        emit()
      }, (e) => onError?.(e))
      return () => { outer(); stopInner() }
    },
  }
}
