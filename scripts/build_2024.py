"""Build the app's 2024 (5.5e) data files from the SRD 5.2.

Usage: python3 -I scripts/build_2024.py <srd52_json_dir> <out_dir>

Source
- SRD 5.2 (CC-BY-4.0) via the 5e-bits/5e-database JSON (src/2024/en): classes and features, one subclass per
  class, species, four backgrounds, origin/general/fighting-style/epic-boon feats, spells, weapon mastery.
- Content only in the 2024 Player's Handbook (other subclasses, backgrounds, Aasimar, most feats, ~50 spells)
  is not here; it is added later by a PHB audit (like scripts/merge_phb_audit.py for 2014).

Output: classes.json, races.json (species), backgrounds.json, feats.json, spells.json, mastery.json in the same
shapes as the 2014 files, so the app's rules code reads either edition.
"""
import json
import os
import re
import sys

SRD, OUT = sys.argv[1:3]
ABILS = ["str", "dex", "con", "int", "wis", "cha"]


def load(name):
    with open(os.path.join(SRD, f"5e-SRD-{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def clean(s):
    """Fix mojibake and PDF hyphenation ("ex- pended") in the source text."""
    if not s:
        return ""
    for bad, good in {"â€™": "’", "â€œ": "“", "â€\x9d": "”", "â€”": "—", "â€“": "–", "â€˜": "‘"}.items():
        s = s.replace(bad, good)
    s = re.sub(r"([a-z])- ([a-z])", r"\1\2", s)
    return re.sub(r"\n\s+", "\n", s).strip()


def summary(desc, limit=220):
    """First sentence(s) of a description, as the card summary."""
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean(desc)).replace("\n", " ")
    out = ""
    for sent in re.split(r"(?<=[.!?])\s+", text):
        if out and len(out) + len(sent) > limit:
            break
        out = f"{out} {sent}".strip()
    return out[:limit + 80]


def skill_id(prof_index):
    return prof_index.removeprefix("skill-")


# ---- classes

# Table columns (class_specific keys → the PHB column names the sheet shows).
COLUMNS = {
    "rage_count": "Rages", "rage_damage_bonus": "Rage Damage", "weapon_mastery": "Weapon Mastery",
    "bardic_inspiration_die": "Bardic Die", "channel_divinity_charges": "Channel Divinity",
    "wild_shape_uses": "Wild Shape", "second_wind_uses": "Second Wind", "martial_arts_die": "Martial Arts",
    "focus_points": "Focus Points", "unarmored_movement_bonus": "Unarmored Movement",
    "favored_enemies": "Favored Enemy", "sneak_attack": "Sneak Attack", "sorcery_points": "Sorcery Points",
    "eldritch_invocations": "Invocations",
}


def column_value(key, v):
    if isinstance(v, dict) and "dice_count" in v:
        return f"{v['dice_count']}d{v['dice_value']}"
    if key in ("bardic_inspiration_die", "martial_arts_die"):
        return f"d{v}"
    if key == "unarmored_movement_bonus":
        return f"+{v} ft." if v else "—"
    return v


# Limited-use features (2024 rules). regainOnShort: a Short Rest gives back that many uses (all on a Long Rest).
RESOURCES = {
    ("barbarian", "Rage"): {"key": "rage", "label": "Rage", "max": "table:Rages", "recharge": "long", "regainOnShort": 1},
    ("bard", "Bardic Inspiration"): {"key": "bardic-inspiration", "label": "Bardic Inspiration", "max": "max(1,cha)", "recharge": "long", "shortRestFrom": 5},
    ("cleric", "Channel Divinity"): {"key": "channel-divinity", "label": "Channel Divinity", "max": "table:Channel Divinity", "recharge": "long", "regainOnShort": 1},
    ("cleric", "Divine Intervention"): {"key": "divine-intervention", "label": "Divine Intervention", "max": 1, "recharge": "long"},
    ("druid", "Wild Shape"): {"key": "wild-shape", "label": "Wild Shape", "max": "table:Wild Shape", "recharge": "long", "regainOnShort": 1},
    ("druid", "Wild Resurgence"): {"key": "wild-resurgence", "label": "Wild Resurgence (slot)", "max": 1, "recharge": "long"},
    ("fighter", "Second Wind"): {"key": "second-wind", "label": "Second Wind", "max": "table:Second Wind", "recharge": "long", "regainOnShort": 1},
    ("fighter", "Action Surge"): {"key": "action-surge", "label": "Action Surge", "byLevel": {"2": 1, "17": 2}, "recharge": "short"},
    ("fighter", "Indomitable"): {"key": "indomitable", "label": "Indomitable", "byLevel": {"9": 1, "13": 2, "17": 3}, "recharge": "long"},
    ("monk", "Monk's Focus"): {"key": "focus-points", "label": "Focus Points", "max": "table:Focus Points", "recharge": "short"},
    ("monk", "Uncanny Metabolism"): {"key": "uncanny-metabolism", "label": "Uncanny Metabolism", "max": 1, "recharge": "long"},
    ("paladin", "Lay On Hands"): {"key": "lay-on-hands", "label": "Lay on Hands pool", "max": "level*5", "recharge": "long"},
    ("paladin", "Paladin's Smite"): {"key": "paladins-smite", "label": "Free Divine Smite", "max": 1, "recharge": "long"},
    ("paladin", "Channel Divinity"): {"key": "channel-divinity", "label": "Channel Divinity", "max": "table:Channel Divinity", "recharge": "long", "regainOnShort": 1},
    ("paladin", "Faithful Steed"): {"key": "faithful-steed", "label": "Free Find Steed", "max": 1, "recharge": "long"},
    ("ranger", "Favored Enemy"): {"key": "favored-enemy", "label": "Free Hunter's Mark", "max": "table:Favored Enemy", "recharge": "long"},
    ("ranger", "Tireless"): {"key": "tireless", "label": "Tireless (Temp HP)", "max": "max(1,wis)", "recharge": "long"},
    ("rogue", "Stroke of Luck"): {"key": "stroke-of-luck", "label": "Stroke of Luck", "max": 1, "recharge": "short"},
    ("sorcerer", "Font of Magic"): {"key": "sorcery-points", "label": "Sorcery Points", "max": "table:Sorcery Points", "recharge": "long"},
    ("sorcerer", "Innate Sorcery"): {"key": "innate-sorcery", "label": "Innate Sorcery", "max": 2, "recharge": "long"},
    ("sorcerer", "Sorcerous Restoration"): {"key": "sorcerous-restoration", "label": "Sorcerous Restoration", "max": 1, "recharge": "long"},
    ("warlock", "Magical Cunning"): {"key": "magical-cunning", "label": "Magical Cunning", "max": 1, "recharge": "long"},
    ("warlock", "Contact Patron"): {"key": "contact-patron", "label": "Free Contact Other Plane", "max": 1, "recharge": "long"},
    ("wizard", "Arcane Recovery"): {"key": "arcane-recovery", "label": "Arcane Recovery", "max": 1, "recharge": "long"},
    # subclasses
    ("berserker", "Intimidating Presence"): {"key": "intimidating-presence", "label": "Intimidating Presence", "max": 1, "recharge": "long"},
    ("land", "Natural Recovery"): {"key": "natural-recovery", "label": "Natural Recovery", "max": 1, "recharge": "long"},
    ("open-hand", "Wholeness of Body"): {"key": "wholeness-of-body", "label": "Wholeness of Body", "max": "max(1,wis)", "recharge": "long"},
    ("draconic", "Dragon Wings"): {"key": "dragon-wings", "label": "Dragon Wings", "max": 1, "recharge": "long"},
    ("fiend", "Dark One's Own Luck"): {"key": "dark-ones-own-luck", "label": "Dark One's Own Luck", "max": "max(1,cha)", "recharge": "long"},
}

# SRD 5.2 subclass ids → the app's ids (the same subclass in 2014 keeps its id, Hebrew name and logic).
SUBCLASS_IDS = {
    "path-of-the-berserker": "berserker", "college-of-lore": "lore", "life-domain": "life", "circle-of-the-land": "land",
    "champion": "champion", "warrior-of-the-open-hand": "open-hand", "oath-of-devotion": "devotion", "hunter": "hunter",
    "thief": "thief", "draconic-sorcery": "draconic", "fiend-patron": "fiend", "evoker": "evocation",
}
SUBCLASS_FLAVOR = {
    "barbarian": "Barbarian Subclass", "bard": "Bard Subclass", "cleric": "Cleric Subclass", "druid": "Druid Subclass",
    "fighter": "Fighter Subclass", "monk": "Monk Subclass", "paladin": "Paladin Subclass", "ranger": "Ranger Subclass",
    "rogue": "Rogue Subclass", "sorcerer": "Sorcerer Subclass", "warlock": "Warlock Subclass", "wizard": "Wizard Subclass",
}
HALF = {"paladin", "ranger"}


def feature_level(f):
    return int(f["level"]["index"].rsplit("-", 1)[1]) if isinstance(f.get("level"), dict) else int(f.get("level", 1))


def build_classes():
    levels = load("Levels")
    feats_by_class = {}
    for f in load("Features"):
        if f.get("subclass"):
            continue
        feats_by_class.setdefault(f["class"]["index"], []).append(f)
    subclasses = load("Subclasses")
    out = []
    for c in load("Classes"):
        cid = c["index"]
        rows = sorted((x for x in levels if x.get("class", {}).get("index") == cid and "subclass" not in x), key=lambda x: x["level"])
        progression = []
        for r in rows:
            sc = r.get("spellcasting") or {}
            slots = [sc.get(f"spell_slots_level_{i}", 0) for i in range(1, 10)]
            cols = {COLUMNS.get(k, k): column_value(k, v) for k, v in (r.get("class_specific") or {}).items()}
            if sc:
                cols = {"Cantrips": sc.get("cantrips_known", 0), "Prepared Spells": sc.get("prepared_spells", 0), **cols}
            progression.append({
                "level": r["level"], "prof": r["prof_bonus"], "features": [f["name"] for f in r["features"]],
                "cantrips": sc.get("cantrips_known", 0), "known": sc.get("prepared_spells", 0), "slots": slots, "columns": cols,
            })
        seen = set()
        features = []
        for f in sorted(feats_by_class.get(cid, []), key=feature_level):
            if f["name"] in seen:
                continue
            seen.add(f["name"])
            feat = {"name": f["name"], "level": feature_level(f), "desc": clean(f["description"]), "summary": summary(f["description"])}
            res = RESOURCES.get((cid, f["name"]))
            if res:
                feat["resource"] = res
            features.append(feat)
        subs = []
        for s in subclasses:
            if s["class"]["index"] != cid:
                continue
            sid = SUBCLASS_IDS.get(s["index"], s["index"])
            sfeats = []
            for f in s["features"]:
                name = clean(f["name"]).split(" Whenever")[0]  # one SRD name has its text glued on
                feat = {"name": name, "level": f["level"], "desc": clean(f.get("description", "")), "summary": summary(f.get("description", ""))}
                res = RESOURCES.get((sid, name))
                if res:
                    feat["resource"] = res
                sfeats.append(feat)
            subs.append({"id": sid, "name": s["name"], "fullName": s["name"], "srd": True, "summary": clean(s.get("summary", "")), "features": sfeats})
        choice = next((p for p in c.get("proficiency_choices", []) if any(o.get("item", {}).get("index", "").startswith("skill-") for o in p["from"]["options"])), None)
        sc = c.get("spellcasting")
        out.append({
            "id": cid, "name": c["name"], "hitDie": c["hit_die"],
            "saves": [s["index"] for s in c["saving_throws"]],
            "proficiencies": [p["name"] for p in c["proficiencies"] if not p["index"].startswith("saving-throw")],
            "skillChoice": {"choose": choice["choose"], "from": [skill_id(o["item"]["index"]) for o in choice["from"]["options"]]} if choice else {"choose": 0, "from": []},
            "spellAbility": sc["spellcasting_ability"]["index"] if sc else None,
            "prepared": ("half" if cid in HALF else "full") if sc else None,
            "subclassLevel": 3, "subclassFlavor": SUBCLASS_FLAVOR[cid],
            "progression": progression, "features": features, "subclasses": subs,
            "startingEquipment": [],
            "startingEquipmentOptions": [{"desc": clean(o["desc"]), "options": []} for o in c.get("starting_equipment_options", [])],
            "edition": "2024",
        })
    return out


# ---- species

# Limited-use species traits, and choices the wizard asks for.
SKILL_CHOICES = {"elf": {"choose": 1, "from": ["insight", "perception", "survival"]}, "human": {"choose": 1, "from": "any"}}


def build_species():
    traits = {t["index"]: t for t in load("Traits")}
    subs = {s["index"]: s for s in load("Subspecies")}
    out = []
    for s in load("Species"):
        sub_trait_ids = {t["index"] for sid in (x["index"] for x in s.get("subspecies", [])) for t in subs[sid]["traits"]}
        base = [traits[t["index"]] for t in s.get("traits", []) if t["index"] in traits]
        race = {
            "id": s["index"], "name": s["name"], "speed": s["speed"], "size": s.get("size") or "Small or Medium",
            "bonuses": {}, "languages": ["Common"], "extraLanguages": 2,
            "traits": [{"id": t["index"], "name": clean(t["name"]), "desc": clean(t["description"])} for t in base],
            "subraces": [],
            "edition": "2024",
        }
        for x in s.get("subspecies", []):
            sub = subs[x["index"]]
            race["subraces"].append({
                "id": sub["index"], "name": clean(sub["name"]).split(": ", 1)[-1], "bonuses": {},
                "traits": [{"id": t["index"], "name": clean(traits[t["index"]]["name"]), "desc": clean(traits[t["index"]]["description"])}
                           for t in sub["traits"] if t["index"] in traits and t["index"] not in {b["index"] for b in base}],
            })
        if s["index"] in SKILL_CHOICES:
            race["skillChoice"] = SKILL_CHOICES[s["index"]]
        if s["index"] == "human":
            race["originFeat"] = True  # Versatile: an Origin feat of your choice
        if s["index"] == "goliath":
            race["speed"] = 35
        _ = sub_trait_ids
        out.append(race)
    return out


# ---- backgrounds

def build_backgrounds(feats):
    out = []
    for b in load("Backgrounds"):
        profs = [p["index"] for p in b["proficiencies"]]
        tool_names = [p["name"].removeprefix("Tool: ") for p in b["proficiencies"] if p["index"].startswith("tool-")]
        feat = feats.get(b["feat"]["index"])
        note = b["feat"].get("note")
        out.append({
            "id": b["index"], "name": b["name"],
            "skills": [skill_id(p) for p in profs if p.startswith("skill-")],
            "tools": tool_names,
            "languages": 0,
            "feature": {"name": b["feat"]["name"] + (f" ({note})" if note else ""), "desc": feat["summary"] if feat else ""},
            "gold": 50, "srd": True,
            "abilityScores": [a["index"] for a in b["ability_scores"]],
            "feat": b["feat"]["index"], "featNote": note,
            "equipment": clean(b["equipment_options"][0]["desc"]) if b.get("equipment_options") else "",
            "edition": "2024",
        })
    return out


# ---- feats

def build_feats():
    out = []
    for f in load("Feats"):
        desc = clean(f["description"])
        feat = {"id": f["index"], "name": f["name"], "summary": summary(desc, 260), "desc": desc, "type": f["type"]}
        m = re.search(r"Increase your (\w+) or (\w+) score by 1", desc)
        if m:
            feat["asi"] = [m.group(1)[:3].lower(), m.group(2)[:3].lower()]
        if f.get("prerequisite_options"):
            opts = f["prerequisite_options"]["from"]["options"]
            feat["prereq"] = {"abilities": [{o["ability_score"]["index"]: o["minimum_score"]} for o in opts]}
        level = (f.get("prerequisites") or {}).get("minimum_level")
        if level:
            feat.setdefault("prereq", {})["level"] = level
        if f.get("repeatable"):
            feat["repeatable"] = True
        if f["index"] == "alert":
            feat["effects"] = {"initiativeProf": True}
        out.append(feat)
    # Common general feats aren't all in the SRD; the PHB audit adds the rest.
    return out


# ---- spells

def build_spells():
    out = []
    for s in load("Spells"):
        out.append({
            "id": s["index"], "name": s["name"], "level": s["level"], "school": s["school"]["index"],
            "castingTime": s["casting_time"], "range": s["range"], "components": ", ".join(s["components"]),
            "material": clean(s.get("material")) or None, "duration": s["duration"], "concentration": s["concentration"],
            "ritual": s["ritual"], "source": "PHB", "srd": True, "classes": [c["index"] for c in s["classes"]],
            "desc": clean(s["description"]), "higherLevel": clean(s.get("higher_level")) or None,
        })
    return sorted(out, key=lambda s: (s["level"], s["name"]))


# ---- weapon mastery

WEAPON_IDS = {"hand-crossbow": "crossbow-hand", "heavy-crossbow": "crossbow-heavy", "light-crossbow": "crossbow-light"}


def build_mastery():
    props = [{"id": p["index"], "name": p["name"], "desc": clean(p["description"])} for p in load("Weapon-Mastery-Properties")]
    weapons = {WEAPON_IDS.get(e["index"], e["index"]): e["mastery"]["index"] for e in load("Equipment") if "mastery" in e}
    return {"properties": props, "weapons": weapons}


def write(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=None, separators=(",", ":"))
        f.write("\n")


os.makedirs(OUT, exist_ok=True)
feats = build_feats()
write("classes.json", build_classes())
write("races.json", build_species())
write("backgrounds.json", build_backgrounds({f["id"]: f for f in feats}))
write("feats.json", feats)
write("spells.json", build_spells())
write("mastery.json", build_mastery())
print("ok", OUT)
