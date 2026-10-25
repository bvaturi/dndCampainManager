import type {
  AppUser, BattleMap, Campaign, Character, Combatant, CombatSnapshot, CombatState, DungeonMaster, EnemySecret, Homebrew, Invite, MapState,
  MapView, Member, NewCharacter, SessionLog, UserProfile,
} from './types'

/**
 * Everything the UI needs from storage + identity. Two implementations:
 * Firebase (Google sign-in + Firestore) and an in-browser demo (localStorage).
 */
export interface Backend {
  readonly kind: 'firebase' | 'demo'
  onAuthChange(cb: (user: AppUser | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>

  touchProfile(user: AppUser): Promise<void>
  listUsers(): Promise<UserProfile[]>
  listAdmins(): Promise<string[]>
  addAdmin(email: string): Promise<void>
  removeAdmin(email: string): Promise<void>
  isAdmin(user: AppUser): Promise<boolean>

  listDms(): Promise<DungeonMaster[]>
  saveDm(dm: DungeonMaster): Promise<void>
  removeDm(email: string): Promise<void>

  listAllCampaigns(): Promise<Campaign[]>
  listCampaignsAsDm(email: string): Promise<Campaign[]>
  listCampaignsAsPlayer(uid: string): Promise<Campaign[]>
  getCampaign(id: string): Promise<Campaign | null>
  createCampaign(c: Omit<Campaign, 'id' | 'createdAt'>): Promise<string>
  updateCampaign(id: string, patch: Partial<Campaign>): Promise<void>
  deleteCampaign(id: string): Promise<void>
  getDmNotes(campaignId: string): Promise<string>
  saveDmNotes(campaignId: string, text: string): Promise<void>

  createInvite(inv: Omit<Invite, 'token' | 'createdAt' | 'uses' | 'revoked'>): Promise<string>
  listInvites(campaignId: string): Promise<Invite[]>
  getInvite(campaignId: string, token: string): Promise<Invite | null>
  revokeInvite(campaignId: string, token: string): Promise<void>
  acceptInvite(campaignId: string, token: string, user: AppUser): Promise<void>

  listMembers(campaignId: string): Promise<Member[]>
  removeMember(campaignId: string, uid: string): Promise<void>

  listSessions(campaignId: string): Promise<SessionLog[]>
  saveSession(campaignId: string, s: Omit<SessionLog, 'id' | 'createdAt'> & { id?: string }): Promise<void>
  deleteSession(campaignId: string, id: string): Promise<void>

  listCharacters(campaignId: string): Promise<Character[]>
  listMyCharacters(uid: string): Promise<Character[]>
  listAllCharacters(): Promise<Character[]>
  getCharacter(campaignId: string, id: string): Promise<Character | null>
  createCharacter(c: NewCharacter): Promise<string>
  updateCharacter(campaignId: string, id: string, patch: Partial<Character>): Promise<void>
  deleteCharacter(campaignId: string, id: string): Promise<void>

  /** Live combat view. DMs get hidden enemies and enemy secrets; players only what they may see. */
  watchCombat(campaignId: string, asDm: boolean, cb: (s: CombatSnapshot) => void, onError?: (e: Error) => void): () => void
  /** Live view of the campaign's characters (for HP during combat). */
  watchCharacters(campaignId: string, cb: (chars: Character[]) => void, onError?: (e: Error) => void): () => void
  saveCombatState(campaignId: string, state: CombatState): Promise<void>
  saveCombatant(campaignId: string, c: Combatant): Promise<void>
  updateCombatant(campaignId: string, id: string, patch: Partial<Combatant>): Promise<void>
  removeCombatant(campaignId: string, id: string): Promise<void>
  saveEnemySecret(campaignId: string, id: string, secret: EnemySecret): Promise<void>
  /** End the encounter: remove every combatant and secret, mark inactive. */
  clearCombat(campaignId: string): Promise<void>

  /** DM's map library (metadata + thumbnails), live. */
  watchMaps(campaignId: string, cb: (maps: BattleMap[]) => void, onError?: (e: Error) => void): () => void
  getMapImage(campaignId: string, id: string): Promise<string | null>
  createMap(campaignId: string, map: Omit<BattleMap, 'id' | 'createdAt'>, image: string): Promise<string>
  updateMap(campaignId: string, id: string, patch: Partial<BattleMap>): Promise<void>
  /** Deletes the map and its image; takes it off the table if it was showing. */
  deleteMap(campaignId: string, id: string): Promise<void>
  saveMapState(campaignId: string, state: MapState): Promise<void>
  /** Live view of the map on the table. Players can read only this one map. */
  watchMap(campaignId: string, cb: (v: MapView) => void, onError?: (e: Error) => void): () => void

  /**
   * Homebrew library, live. `all` (DM): everything, suggestions included. Otherwise the approved items, plus the
   * viewer's own suggestions when `uid` is given.
   */
  watchHomebrew(campaignId: string, opts: { all?: boolean; uid?: string }, cb: (items: Homebrew[]) => void, onError?: (e: Error) => void): () => void
  /** Create or replace an item (its id starts with "hb-"). */
  saveHomebrew(campaignId: string, item: Homebrew): Promise<void>
  deleteHomebrew(campaignId: string, id: string): Promise<void>
}

export const BOOTSTRAP_ADMINS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean)

export function randomToken(len = 24): string {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

export function inviteProblem(inv: Invite | null, user: AppUser): string | null {
  if (!inv) return 'inviteNotFound'
  if (inv.revoked) return 'inviteRevoked'
  if (inv.expiresAt < Date.now()) return 'inviteExpired'
  if (inv.email && inv.email.toLowerCase() !== user.email.toLowerCase()) return 'inviteWrongEmail'
  return null
}

const firebaseConfigured = !!import.meta.env.VITE_FIREBASE_API_KEY
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' || !firebaseConfigured

let instance: Promise<Backend> | null = null
export function getBackend(): Promise<Backend> {
  if (!instance) {
    instance = isDemo
      ? import('./demoBackend').then((m) => m.createDemoBackend())
      : import('./firebaseBackend').then((m) => m.createFirebaseBackend())
  }
  return instance
}
