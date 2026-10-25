import { BOOTSTRAP_ADMINS, inviteProblem, randomToken, type Backend } from './backend'
import type {
  AppUser, BattleMap, Campaign, Character, Combatant, CombatSnapshot, CombatState, DungeonMaster, EnemySecret, Homebrew, Invite, MapState,
  MapView, Member, SessionLog, UserProfile,
} from './types'

/** Offline backend: one localStorage blob, fake Google sign-in. Mirrors the Firestore layout. */
interface Store {
  users: Record<string, UserProfile>
  admins: string[]
  dms: Record<string, DungeonMaster>
  campaigns: Record<string, Campaign>
  notes: Record<string, string>
  invites: Record<string, Invite>
  members: Record<string, Record<string, Member>>
  sessions: Record<string, Record<string, SessionLog>>
  characters: Record<string, Record<string, Character>>
  combat?: Record<string, { state: CombatState | null; combatants: Record<string, Combatant>; secrets: Record<string, EnemySecret> }>
  /** Map library per campaign. Images are kept under their own localStorage keys so the store stays small. */
  maps?: Record<string, { state: MapState | null; list: Record<string, BattleMap> }>
  homebrew?: Record<string, Record<string, Homebrew>>
}

const KEY = 'codex-demo-store'
const SESSION_KEY = 'codex-demo-user'
const mapImageKey = (id: string) => `codex-demo-mapimg-${id}`

export const DEMO_PERSONAS: AppUser[] = [
  { uid: 'demo-admin', email: BOOTSTRAP_ADMINS[0] || 'admin@example.com', displayName: 'Platform Manager' },
  { uid: 'demo-dm', email: 'dm@example.com', displayName: 'Dana the DM' },
  { uid: 'demo-p1', email: 'player1@example.com', displayName: 'Noa' },
  { uid: 'demo-p2', email: 'player2@example.com', displayName: 'Itai' },
]

function empty(): Store {
  return { users: {}, admins: [], dms: {}, campaigns: {}, notes: {}, invites: {}, members: {}, sessions: {}, characters: {} }
}

function read(): Store {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return empty()
  }
}

function write(fn: (s: Store) => void) {
  const s = read()
  fn(s)
  localStorage.setItem(KEY, JSON.stringify(s))
}

function combatOf(s: Store, cid: string) {
  return ((s.combat ||= {})[cid] ||= { state: null, combatants: {}, secrets: {} })
}

function mapsOf(s: Store, cid: string) {
  return ((s.maps ||= {})[cid] ||= { state: null, list: {} })
}

const tick = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 30))

export function createDemoBackend(): Backend & { signInAs(u: AppUser): Promise<void> } {
  const listeners = new Set<(u: AppUser | null) => void>()
  const current = (): AppUser | null => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    } catch {
      return null
    }
  }
  const emit = () => listeners.forEach((l) => l(current()))
  const id = () => randomToken(12)

  return {
    kind: 'demo',
    onAuthChange(cb) {
      listeners.add(cb)
      setTimeout(() => cb(current()), 0)
      return () => listeners.delete(cb)
    },
    async signIn() {
      throw new Error('Use signInAs in demo mode')
    },
    async signInAs(u) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...u, email: u.email.toLowerCase() }))
      emit()
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY)
      emit()
    },

    async touchProfile(user) {
      write((s) => { s.users[user.uid] = { ...user, lastSeen: Date.now() } })
    },
    listUsers: () => tick(Object.values(read().users)),
    listAdmins: () => tick([...new Set([...BOOTSTRAP_ADMINS, ...read().admins])]),
    async addAdmin(email) {
      write((s) => { s.admins = [...new Set([...s.admins, email.toLowerCase()])] })
    },
    async removeAdmin(email) {
      write((s) => { s.admins = s.admins.filter((a) => a !== email) })
    },
    async isAdmin(user) {
      return BOOTSTRAP_ADMINS.includes(user.email) || user.uid === 'demo-admin' || read().admins.includes(user.email)
    },

    listDms: () => tick(Object.values(read().dms)),
    async saveDm(dm) {
      write((s) => { s.dms[dm.email.toLowerCase()] = { ...dm, email: dm.email.toLowerCase() } })
    },
    async removeDm(email) {
      write((s) => { delete s.dms[email] })
    },

    listAllCampaigns: () => tick(Object.values(read().campaigns).sort((a, b) => b.createdAt - a.createdAt)),
    listCampaignsAsDm: (email) => tick(Object.values(read().campaigns).filter((c) => c.dmEmail === email)),
    async listCampaignsAsPlayer(uid) {
      const s = read()
      return tick(Object.values(s.campaigns).filter((c) => s.members[c.id]?.[uid]))
    },
    getCampaign: (cid) => tick(read().campaigns[cid] || null),
    async createCampaign(c) {
      const cid = id()
      write((s) => { s.campaigns[cid] = { ...c, dmEmail: c.dmEmail.toLowerCase(), id: cid, createdAt: Date.now() } })
      return cid
    },
    async updateCampaign(cid, patch) {
      write((s) => { s.campaigns[cid] = { ...s.campaigns[cid], ...patch } })
    },
    async deleteCampaign(cid) {
      write((s) => {
        delete s.campaigns[cid]; delete s.members[cid]; delete s.sessions[cid]; delete s.characters[cid]; delete s.notes[cid]
        Object.keys(s.maps?.[cid]?.list ?? {}).forEach((mid) => localStorage.removeItem(mapImageKey(mid)))
        delete s.maps?.[cid]; delete s.combat?.[cid]
      })
    },
    getDmNotes: (cid) => tick(read().notes[cid] || ''),
    async saveDmNotes(cid, text) {
      write((s) => { s.notes[cid] = text })
    },

    async createInvite(inv) {
      const token = randomToken()
      write((s) => { s.invites[token] = { ...inv, email: inv.email?.toLowerCase() || null, token, createdAt: Date.now(), uses: 0, revoked: false } })
      return token
    },
    listInvites: (cid) => tick(Object.values(read().invites).filter((i) => i.campaignId === cid)),
    getInvite: (_cid, token) => tick(read().invites[token] || null),
    async revokeInvite(_cid, token) {
      write((s) => { s.invites[token].revoked = true })
    },
    async acceptInvite(_cid, token, user) {
      const inv = read().invites[token] || null
      const problem = inviteProblem(inv, user)
      if (problem) throw new Error(problem)
      write((s) => {
        const m = (s.members[inv!.campaignId] ||= {})
        if (m[user.uid]) return
        m[user.uid] = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, inviteToken: token, joinedAt: Date.now() }
        s.invites[token].uses++
      })
    },

    listMembers: (cid) => tick(Object.values(read().members[cid] || {})),
    async removeMember(cid, uid) {
      write((s) => { delete s.members[cid]?.[uid] })
    },

    listSessions: (cid) => tick(Object.values(read().sessions[cid] || {}).sort((a, b) => b.number - a.number)),
    async saveSession(cid, sess) {
      write((s) => {
        const bucket = (s.sessions[cid] ||= {})
        const sid = sess.id || id()
        bucket[sid] = { ...(bucket[sid] || { createdAt: Date.now() }), ...sess, id: sid }
      })
    },
    async deleteSession(cid, sid) {
      write((s) => { delete s.sessions[cid]?.[sid] })
    },

    listCharacters: (cid) => tick(Object.values(read().characters[cid] || {})),
    listMyCharacters: (uid) => tick(Object.values(read().characters).flatMap((b) => Object.values(b)).filter((c) => c.ownerUid === uid)),
    listAllCharacters: () => tick(Object.values(read().characters).flatMap((b) => Object.values(b))),
    getCharacter: (cid, chid) => tick(read().characters[cid]?.[chid] || null),
    async createCharacter(c) {
      const chid = id()
      const now = Date.now()
      write((s) => { (s.characters[c.campaignId] ||= {})[chid] = { ...c, id: chid, createdAt: now, updatedAt: now } })
      return chid
    },
    async updateCharacter(cid, chid, patch) {
      write((s) => { s.characters[cid][chid] = { ...s.characters[cid][chid], ...patch, updatedAt: Date.now() } })
    },
    async deleteCharacter(cid, chid) {
      write((s) => { delete s.characters[cid]?.[chid] })
    },

    // Live views: poll the shared store (also picks up changes from other tabs).
    watchCombat(cid, asDm, cb) {
      let last = ''
      const tickFn = () => {
        const c = read().combat?.[cid]
        const snap: CombatSnapshot = {
          state: c?.state ?? null,
          combatants: Object.values(c?.combatants ?? {}).filter((x) => asDm || !x.hidden),
          secrets: asDm ? c?.secrets ?? {} : {},
        }
        const json = JSON.stringify(snap)
        if (json !== last) { last = json; cb(structuredClone(snap)) }
      }
      tickFn()
      const iv = setInterval(tickFn, 400)
      return () => clearInterval(iv)
    },
    watchCharacters(cid, cb) {
      let last = ''
      const tickFn = () => {
        const list = Object.values(read().characters[cid] || {})
        const json = JSON.stringify(list)
        if (json !== last) { last = json; cb(structuredClone(list)) }
      }
      tickFn()
      const iv = setInterval(tickFn, 400)
      return () => clearInterval(iv)
    },
    async saveCombatState(cid, state) {
      write((s) => { combatOf(s, cid).state = state })
    },
    async saveCombatant(cid, c) {
      write((s) => { combatOf(s, cid).combatants[c.id] = c })
    },
    async updateCombatant(cid, id, patch) {
      write((s) => { const x = combatOf(s, cid).combatants; if (x[id]) x[id] = { ...x[id], ...patch } })
    },
    async removeCombatant(cid, id) {
      write((s) => { const c = combatOf(s, cid); delete c.combatants[id]; delete c.secrets[id] })
    },
    async saveEnemySecret(cid, id, secret) {
      write((s) => { combatOf(s, cid).secrets[id] = secret })
    },
    async clearCombat(cid) {
      write((s) => { (s.combat ||= {})[cid] = { state: { active: false, name: '', round: 0, turnId: null, startedAt: 0 }, combatants: {}, secrets: {} } })
    },

    watchHomebrew(cid, opts, cb) {
      let last = ''
      const tickFn = () => {
        const list = Object.values(read().homebrew?.[cid] ?? {})
          .filter((h) => opts.all || h.status === 'approved' || (opts.uid && h.createdBy === opts.uid))
          .sort((a, b) => a.name.localeCompare(b.name))
        const json = JSON.stringify(list)
        if (json !== last) { last = json; cb(structuredClone(list)) }
      }
      tickFn()
      const iv = setInterval(tickFn, 400)
      return () => clearInterval(iv)
    },
    async saveHomebrew(cid, item) {
      write((s) => { ((s.homebrew ||= {})[cid] ||= {})[item.id] = structuredClone(item) })
    },
    async deleteHomebrew(cid, hid) {
      write((s) => { delete s.homebrew?.[cid]?.[hid] })
    },

    watchMaps(cid, cb) {
      let last = ''
      const tickFn = () => {
        const list = Object.values(read().maps?.[cid]?.list ?? {}).sort((a, b) => b.createdAt - a.createdAt)
        const json = JSON.stringify(list)
        if (json !== last) { last = json; cb(structuredClone(list)) }
      }
      tickFn()
      const iv = setInterval(tickFn, 400)
      return () => clearInterval(iv)
    },
    getMapImage: (_cid, mid) => tick(localStorage.getItem(mapImageKey(mid))),
    async createMap(cid, map, image) {
      const mid = id()
      localStorage.setItem(mapImageKey(mid), image) // throws if the browser's storage is full
      write((s) => { mapsOf(s, cid).list[mid] = { ...map, id: mid, createdAt: Date.now() } })
      return mid
    },
    async updateMap(cid, mid, patch) {
      write((s) => { const l = mapsOf(s, cid).list; if (l[mid]) l[mid] = { ...l[mid], ...patch, id: mid } })
    },
    async deleteMap(cid, mid) {
      write((s) => {
        const m = mapsOf(s, cid)
        delete m.list[mid]
        if (m.state?.mapId === mid) m.state = { ...m.state, mapId: null }
      })
      localStorage.removeItem(mapImageKey(mid))
    },
    async saveMapState(cid, state) {
      write((s) => { mapsOf(s, cid).state = state })
    },
    watchMap(cid, cb) {
      let last = ''
      const tickFn = () => {
        const m = read().maps?.[cid]
        const state = m?.state ?? null
        const map = (state?.mapId && m?.list[state.mapId]) || null
        const json = JSON.stringify([state, map])
        if (json === last) return
        last = json
        const view: MapView = { state, map, image: map ? localStorage.getItem(mapImageKey(map.id)) : null }
        cb(structuredClone(view))
      }
      tickFn()
      const iv = setInterval(tickFn, 400)
      return () => clearInterval(iv)
    },
  }
}
