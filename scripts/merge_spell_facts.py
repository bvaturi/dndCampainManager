"""Fill in facts missing from non-SRD spells in src/data/spells.json.

Usage: python3 -I scripts/merge_spell_facts.py

Spells outside the SRD (PHB, Xanathar's, Tasha's) come from aidedd.org filter pages, which list level, school,
casting time, range, components and flags but not duration or the material component. scripts/spell_facts.json
holds those two facts per spell (taken from each spell's aidedd page; no rules text). Also writes ranges the
way SRD spells do ("60 feet", not "60 ft"). Idempotent.
"""
import json
import re

SPELLS = "src/data/spells.json"
facts = json.load(open("scripts/spell_facts.json", encoding="utf-8"))
spells = json.load(open(SPELLS, encoding="utf-8"))
# Durations the source data words differently from the Player's Handbook.
DURATION_FIX = {
    "prestidigitation": "Up to 1 hour",
    "thaumaturgy": "Up to 1 minute",
    "etherealness": "Up to 8 hours",
    "find-the-path": "Up to 1 day",
    "project-image": "Up to 1 day",
    "forbiddance": "1 day",
}
# "At Higher Levels" texts the source data garbled (SRD wording).
HIGHER_FIX = {
    "moonbeam": "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d10 for each slot level above 2nd.",
    "shatter": "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd.",
    "dominate-beast": "When you cast this spell with a 5th-level spell slot, the duration is concentration, up to 10 minutes. When you use a 6th-level spell slot, the duration is concentration, up to 1 hour. When you use a spell slot of 7th level or higher, the duration is concentration, up to 8 hours.",
    "hold-monster": "When you cast this spell using a spell slot of 6th level or higher, you can target one additional creature for each slot level above 5th. The creatures must be within 30 feet of each other when you target them.",
}
filled = 0
for s in spells:
    if s["id"] in DURATION_FIX:
        s["duration"] = DURATION_FIX[s["id"]]
    if s["id"] in HIGHER_FIX:
        s["higherLevel"] = HIGHER_FIX[s["id"]]
    s["range"] = re.sub(r"(\d+)-ft\b", r"\1-foot", re.sub(r"(\d+) ft\b", r"\1 feet", s["range"]))
    f = facts.get(s["id"])
    if not f:
        continue
    if not s.get("duration"):
        s["duration"] = f["duration"]
        filled += 1
    if f.get("material") and not s.get("material"):
        s["material"] = f["material"]
with open(SPELLS, "w", encoding="utf-8") as out:
    json.dump(spells, out, ensure_ascii=False, indent=None, separators=(",", ":"))
    out.write("\n")
print(f"spell facts: {filled} durations filled; {sum(1 for s in spells if not s.get('duration'))} still missing")
