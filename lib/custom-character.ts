import type { Character, CustomSpell } from "./rules";
import { characterSchema } from "./character-schema";
import type { CharacterType } from "./campaign-types";
// Neutral creation values only. AI imports must replace these with confirmed facts.
export function newCharacter(name = "", player = ""): Character {
  return {
    name,
    player,
    className: "Unspecified class",
    species: "",
    subclass: "",
    rulesEdition: "2014",
    features: "",
    customSpells: [],
    slotMax: Array(9).fill(0),
    spellAbility: 4,
    level: 1,
    scores: [10, 10, 10, 10, 10, 10],
    hp: 1,
    maxHP: 1,
    tempHP: 0,
    ac: 10,
    speed: 0,
    xp: 0,
    alignment: "",
    background: "",
    proficient: [],
    saveProf: [],
    prepared: [],
    cantrips: [],
    spent: Array(9).fill(0),
    channel: 0,
    wrath: 0,
    stone: 0,
    reaction: false,
    hitDiceSpent: 0,
    concentration: "",
    equipment: "",
    notes: "",
    languages: "",
    coins: "",
    deathSuccess: 0,
    deathFailure: 0,
    log: [],
  };
}
export function readImport(value: unknown, fallback: CharacterType) {
  const envelope = value as { type?: unknown; character?: unknown };
  const data = characterSchema.parse(envelope?.character ?? value);
  const type = envelope?.type ?? (data.className ? "custom" : fallback);
  if (type !== "custom" && type !== "varen" && type !== "arad")
    throw Error("Unknown sheet mode.");
  if (type === "custom" && !data.className?.trim())
    throw Error("Include className for a general character sheet.");
  return { type: type as CharacterType, data };
}
export function castCustom(
  character: Character,
  spell: CustomSpell,
  slot: number,
): Character {
  if (!spell.prepared)
    throw Error("Prepare or ready this spell before casting.");
  const spent = [...character.spent];
  if (spell.level > 0) {
    const total = character.slotMax?.[slot - 1] || 0;
    if (
      !Number.isInteger(slot) ||
      slot < spell.level ||
      slot > 9 ||
      spent[slot - 1] >= total
    )
      throw Error("No available slot of that level.");
    spent[slot - 1]++;
  }
  return {
    ...character,
    spent,
    concentration: spell.concentration ? spell.name : character.concentration,
    log: [
      `Cast ${spell.name}${spell.level ? ` with a level ${slot} slot` : " (cantrip)"}.`,
      ...character.log,
    ].slice(0, 30),
  };
}
