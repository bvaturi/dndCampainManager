"""Merge scripts/races_extra.json into src/data/races.json and src/data/he.json.

Usage: python3 -I scripts/merge_races.py      (run after build_data.py; safe to run repeatedly)

- Adds race skill grants the SRD build doesn't model (elf Perception, half-orc Intimidation, half-elf any two).
- Adds non-SRD races (Goliath from Volo's Guide, Changeling from Eberron: Rising from the Last War),
  replacing any earlier copy, and their Hebrew names.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RACES = os.path.join(ROOT, "src", "data", "races.json")
HE = os.path.join(ROOT, "src", "data", "he.json")
EXTRA = os.path.join(ROOT, "scripts", "races_extra.json")


def main():
    with open(RACES, encoding="utf-8") as f:
        races = json.load(f)
    with open(HE, encoding="utf-8") as f:
        he = json.load(f)
    with open(EXTRA, encoding="utf-8") as f:
        extra = json.load(f)

    for rid, grant in extra["skills"].items():
        race = next(r for r in races if r["id"] == rid)
        race.pop("skills", None)
        race.pop("skillChoice", None)
        if "skills" in grant:
            race["skills"] = grant["skills"]
        if "skillChoice" in grant:
            race["skillChoice"] = grant["skillChoice"]
        print(f"{rid}: skills {grant.get('skills') or grant.get('skillChoice')}")

    for r in extra["races"]:
        r = dict(r)
        names = r.pop("he")
        races = [x for x in races if x["id"] != r["id"]] + [r]
        he["races"][r["id"]] = names["name"]
        for tid, name in names.get("traits", {}).items():
            he["traits"][tid] = name
        for lang, name in names.get("languages", {}).items():
            he["languages"][lang] = name
        print(f"{r['id']}: added ({r['source']})")

    with open(RACES, "w", encoding="utf-8") as f:
        json.dump(races, f, ensure_ascii=False, separators=(",", ":"))
    with open(HE, "w", encoding="utf-8") as f:
        json.dump(he, f, ensure_ascii=False, indent=0)
    print(f"{len(races)} races")


if __name__ == "__main__":
    main()
