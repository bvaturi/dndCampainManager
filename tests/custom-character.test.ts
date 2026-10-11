import { describe, it, expect } from "vitest";
import { newCharacter, readImport, castCustom } from "../lib/custom-character";
import { summaryOf } from "../lib/campaign-types";
import { initial } from "../lib/rules";
import { characterSchema } from "../lib/character-schema";
describe("New characters and independent spell libraries", () => {
  it("detects a new wizard regardless of selected legacy engine and round-trips custom data", () => {
    const data = {
      ...newCharacter("A new wizard", "Player"),
      species: "Elf",
      className: "Wizard",
      features: "Arcane Recovery",
      customSpells: [
        {
          id: "shield",
          name: "Shield",
          level: 1,
          prepared: true,
          description: "Reaction; protect against attacks.",
          concentration: false,
        },
      ],
      slotMax: [2, 0, 0, 0, 0, 0, 0, 0, 0],
    };
    const parsed = readImport({ type: "custom", character: data }, "arad");
    expect(parsed.type).toBe("custom");
    expect(parsed.data).toEqual(data);
    expect(
      summaryOf({
        type: parsed.type,
        data: parsed.data,
        ownerUid: "owner",
        revision: 1,
        updatedAt: 1,
        updatedBy: "owner",
      }).className,
    ).toBe("Elf · Wizard");
    expect(readImport(initial, "varen").type).toBe("varen");
  });
  it("consumes slots without removing preparation, replaces concentration and rejects unready spells", () => {
    const c = {
      ...newCharacter(),
      slotMax: [2, 1, 0, 0, 0, 0, 0, 0, 0],
      concentration: "Previous spell",
    };
    const s = {
      id: "hold",
      name: "Hold Person",
      level: 2,
      prepared: true,
      description: "",
      concentration: true,
    };
    const result = castCustom(c, s, 2);
    expect(result.spent[1]).toBe(1);
    expect(result.concentration).toBe("Hold Person");
    expect(() => castCustom(result, s, 2)).toThrow("No available");
    expect(() => castCustom(c, s, 1)).toThrow();
    expect(() => castCustom(c, { ...s, prepared: false }, 2)).toThrow(
      "Prepare",
    );
    expect(c.spent[1]).toBe(0);
  });
  it("casts known cantrips without slots and rejects oversized or duplicate imported spells", () => {
    const c = newCharacter();
    const s = {
      id: "light",
      name: "Light",
      level: 0,
      prepared: true,
      description: "",
      concentration: false,
    };
    expect(castCustom(c, s, 0).spent).toEqual(Array(9).fill(0));
    expect(
      characterSchema.safeParse({ ...c, customSpells: [s, s] }).success,
    ).toBe(false);
    expect(
      characterSchema.safeParse({
        ...c,
        customSpells: [{ ...s, description: "x".repeat(2001) }],
      }).success,
    ).toBe(false);
    expect(() =>
      readImport(
        { type: "custom", character: { ...c, className: "" } },
        "varen",
      ),
    ).toThrow();
  });
});
