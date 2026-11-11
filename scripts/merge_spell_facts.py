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
filled = 0
for s in spells:
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
