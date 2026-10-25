export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
export type AbilityScores = Record<Ability, number>

export interface AppUser {
  uid: string
  email: string
  displayName: string
  photoURL?: string
}

export interface UserProfile extends AppUser {
  lastSeen: number
}

export interface DungeonMaster {
  email: string
  name: string
  addedAt: number
}

export interface Campaign {
  id: string
  name: string
  description: string
  setting: string
  dmEmail: string
  dmName: string
  status: 'active' | 'paused' | 'finished'
  startingLevel: number
  createdAt: number
  createdBy: string
}

export interface Invite {
  token: string
  campaignId: string
  campaignName: string
  dmName: string
  email: string | null
  createdAt: number
  expiresAt: number
  revoked: boolean
  uses: number
}

export interface Member {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  inviteToken: string
  joinedAt: number
}

export interface SessionLog {
  id: string
  number: number
  title: string
  date: string
  summary: string
  createdAt: number
}

export interface Attack {
  name: string
  bonus: string
  damage: string
}

export interface KnownSpell {
  id: string
  prepared: boolean
}

/** A feat (or Ability Score Improvement, or homebrew feat) the character has taken. */
export interface CharacterFeat {
  uid: string
  /** Feat id from feats.json, 'asi' for an Ability Score Improvement, or 'custom'. */
  featId: string
  /** Name and description for custom feats. */
  name?: string
  description?: string
  level: number
  /** Ability picked for a +1 (or the first +1 of an ASI). */
  choice?: Ability
  /** Second +1 of an ASI (same as choice = +2). */
  choice2?: Ability
  notes: string
  /** What adding the feat changed on the sheet, so removing it can undo exactly that. */
  applied?: { abilities?: Partial<Record<Ability, number>>; save?: Ability; hp?: number }
}

/** A free-text page the player adds to their character (e.g. "Enchanted items"). */
export interface CustomTab {
  id: string
  title: string
  content: string
}

export interface Character {
  id: string
  campaignId: string
  ownerUid: string
  ownerName: string
  // identity
  name: string
  race: string
  subrace: string
  classId: string
  subclass: string
  level: number
  background: string
  alignment: string
  xp: number
  // abilities
  baseAbilities: AbilityScores
  abilities: AbilityScores
  saveProfs: Ability[]
  skillProfs: string[]
  expertise: string[]
  // combat
  inspiration: boolean
  armorClass: number
  speed: number
  hpMax: number
  hpCurrent: number
  hpTemp: number
  hitDiceUsed: number
  deathSaves: { successes: number; failures: number }
  attacks: Attack[]
  // gear & text blocks
  equipment: string
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
  otherProficiencies: string
  features: string
  personality: string
  ideals: string
  bonds: string
  flaws: string
  // page 2
  age: string
  height: string
  weight: string
  eyes: string
  skin: string
  hair: string
  appearance: string
  portraitUrl: string
  backstory: string
  allies: string
  symbolName: string
  additionalFeatures: string
  treasure: string
  // spells
  spells: KnownSpell[]
  slotsExpended: number[]
  feats?: CharacterFeat[]
  tabs?: CustomTab[]
  /** Uses spent of limited class resources, keyed by resource key (e.g. 'lay-on-hands': 12 HP used). */
  resources?: Record<string, number>
  createdAt: number
  updatedAt: number
}

export type NewCharacter = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>

// ------------------------------------------------------------------ combat
/** One encounter per campaign (doc campaigns/{cid}/combat/state). Only the DM writes it. */
export interface CombatState {
  active: boolean
  name: string
  round: number
  /** Combatant whose turn it is. */
  turnId: string | null
  startedAt: number
}

export type EnemyStatus = 'healthy' | 'bloodied' | 'down'

/**
 * A line in the initiative order (campaigns/{cid}/combatants/{id}). Everyone in the campaign can read the visible ones.
 * Player characters use the character id as their id, and players may only set their own initiative.
 */
export interface Combatant {
  id: string
  kind: 'pc' | 'enemy'
  name: string
  initiative: number | null
  /** Dice breakdown of the initiative roll, shown to the table. */
  roll?: { dice: number[]; kept: number; parts: { label: string; value: number }[]; manual?: boolean } | null
  /** Tie-breaker: higher Dexterity modifier goes first. */
  dexMod: number
  hidden: boolean
  conditions: string[]
  /** Enemies: coarse health shown to players (exact HP stays DM-only). */
  status?: EnemyStatus
  ownerUid?: string
  /** Where the token stands on the battle map (only shown while that map is on the table). */
  mapPos?: MapPos | null
  createdAt: number
}

/** DM-only numbers for an enemy (campaigns/{cid}/combatSecrets/{id}). */
export interface EnemySecret {
  hp: number
  hpMax: number
  ac: number
  initBonus: number
  notes: string
}

export interface CombatSnapshot {
  state: CombatState | null
  combatants: Combatant[]
  secrets: Record<string, EnemySecret>
}

// ------------------------------------------------------------------ battle map
/**
 * A picture in the DM's map library (campaigns/{cid}/maps/{id}). The full image lives in mapImages/{id}
 * so grid tweaks don't resend it. No Cloud Storage: images are shrunk in the browser and kept in Firestore.
 */
export interface BattleMap {
  id: string
  name: string
  /** Small preview (data URL) for the library. */
  thumb: string
  /** Pixel size of the stored image. */
  width: number
  height: number
  /** Grid of cols × rows squares, 5 ft each. */
  cols: number
  rows: number
  /** Grid shift as a fraction of a square (0–1), to line up with a grid drawn on the image. */
  offsetX: number
  offsetY: number
  /** 0 hides the grid (e.g. for a scene). */
  gridOpacity: number
  gridColor: 'dark' | 'light'
  createdAt: number
}

/** What is on the table (doc campaigns/{cid}/combat/map). Only the DM writes it. */
export interface MapState {
  mapId: string | null
  /** Players may drag their own character's token. */
  playersMove: boolean
}

export interface MapPos {
  mapId: string
  x: number
  y: number
}

export interface MapView {
  state: MapState | null
  map: BattleMap | null
  image: string | null
}

// ---- homebrew (campaign library: the DM's own spells and abilities; players can suggest)

/** Approved items are live for the whole campaign; pending ones are suggestions waiting for the DM. */
export type HomebrewStatus = 'approved' | 'pending'

interface HomebrewBase {
  id: string
  campaignId: string
  status: HomebrewStatus
  createdBy: string
  createdByName: string
  createdAt: number
  name: string
  desc: string
  /** Characters (ids) who have it regardless of class list — boons, items, story powers. */
  grantedTo: string[]
  /** A player's note to the DM with a suggestion. */
  note?: string
}

export interface HomebrewSpell extends HomebrewBase {
  kind: 'spell'
  level: number
  school: string
  castingTime: string
  range: string
  components: string
  material?: string
  duration: string
  concentration: boolean
  ritual: boolean
  higherLevel?: string
  /** Class lists it's on (class ids). */
  classes: string[]
}

export type AbilityCategory = 'class' | 'race' | 'item' | 'boon' | 'other'
export type AbilityActivation = 'action' | 'bonus' | 'reaction' | 'passive' | 'other'

export interface HomebrewAbility extends HomebrewBase {
  kind: 'ability'
  category: AbilityCategory
  activation: AbilityActivation
  /** Limited uses: a number or expression (prof, level, wis, level*5…). null = unlimited / passive. */
  uses: { max: string; recharge: 'short' | 'long' } | null
  /** Dice to roll, e.g. "1d8+wis" or "2d6". */
  dice?: string
}

export type Homebrew = HomebrewSpell | HomebrewAbility
