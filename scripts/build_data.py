"""Build the app's 5e data files.

Usage: python3 -I scripts/build_data.py <srd_json_dir> <aidedd_html_dir> <out_dir>

Sources
- SRD 5.1 (CC-BY-4.0) via the 5e-bits/5e-database JSON: full rules text for SRD content.
- aidedd.org spell filter pages (one per class): spell metadata and class lists for
  PHB / Xanathar / Tasha spells. Only facts (name, level, school, timing, range,
  components, flags, source, classes) are taken; descriptions come from the SRD only.
- PHB facts not in the SRD (extra subraces, subclasses, backgrounds) are encoded by
  hand below as mechanics only (no rules prose).
"""
import html
import json
import os
import re
import sys

SRD, AIDEDD, OUT = sys.argv[1:4]
ABILS = ["str", "dex", "con", "int", "wis", "cha"]


def load(name):
    with open(os.path.join(SRD, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "").replace("´", "")).strip("-")


def text(desc):
    if isinstance(desc, list):
        return "\n".join(desc)
    return desc or ""


traits = {t["index"]: t for t in load("Traits")}
features = load("Features")


def trait_list(refs):
    out = []
    for r in refs:
        t = traits.get(r["index"])
        out.append({"id": r["index"], "name": r["name"], "desc": text(t["desc"]) if t else ""})
    return out


# ---------------------------------------------------------------- races
srd_subraces = {s["index"]: s for s in load("Subraces")}

# PHB subraces missing from the SRD: mechanics only.
EXTRA_SUBRACES = {
    "dwarf": [{"id": "mountain-dwarf", "name": "Mountain Dwarf", "bonuses": {"str": 2},
               "traits": [{"id": "dwarven-armor-training", "name": "Dwarven Armor Training", "desc": ""}]}],
    "elf": [
        {"id": "wood-elf", "name": "Wood Elf", "bonuses": {"wis": 1}, "speed": 35,
         "traits": [{"id": "elf-weapon-training", "name": "Elf Weapon Training", "desc": ""},
                    {"id": "fleet-of-foot", "name": "Fleet of Foot", "desc": ""},
                    {"id": "mask-of-the-wild", "name": "Mask of the Wild", "desc": ""}]},
        {"id": "dark-elf", "name": "Dark Elf (Drow)", "bonuses": {"cha": 1},
         "traits": [{"id": "superior-darkvision", "name": "Superior Darkvision", "desc": ""},
                    {"id": "sunlight-sensitivity", "name": "Sunlight Sensitivity", "desc": ""},
                    {"id": "drow-magic", "name": "Drow Magic", "desc": ""},
                    {"id": "drow-weapon-training", "name": "Drow Weapon Training", "desc": ""}]},
    ],
    "halfling": [{"id": "stout-halfling", "name": "Stout Halfling", "bonuses": {"con": 1},
                  "traits": [{"id": "stout-resilience", "name": "Stout Resilience", "desc": ""}]}],
    "gnome": [{"id": "forest-gnome", "name": "Forest Gnome", "bonuses": {"dex": 1},
               "traits": [{"id": "natural-illusionist", "name": "Natural Illusionist", "desc": ""},
                          {"id": "speak-with-small-beasts", "name": "Speak with Small Beasts", "desc": ""}]}],
}

races = []
for r in load("Races"):
    race = {
        "id": r["index"],
        "name": r["name"],
        "speed": r["speed"],
        "size": r["size"],
        "bonuses": {b["ability_score"]["index"]: b["bonus"] for b in r["ability_bonuses"]},
        "languages": [l["name"] for l in r["languages"]],
        "extraLanguages": (r.get("language_options") or {}).get("choose", 0),
        "traits": trait_list(r["traits"]),
        "subraces": [],
    }
    opt = r.get("ability_bonus_options")
    if opt:
        race["bonusChoice"] = {
            "choose": opt["choose"],
            "amount": opt["from"]["options"][0]["bonus"],
            "from": [o["ability_score"]["index"] for o in opt["from"]["options"]],
        }
    for sref in r.get("subraces", []):
        s = srd_subraces[sref["index"]]
        race["subraces"].append({
            "id": s["index"], "name": s["name"],
            "bonuses": {b["ability_score"]["index"]: b["bonus"] for b in s["ability_bonuses"]},
            "traits": trait_list(s["racial_traits"]),
            "srd": True,
        })
    race["subraces"] += EXTRA_SUBRACES.get(r["index"], [])
    races.append(race)

# ---------------------------------------------------------------- classes
levels = load("Levels")
equipment = {e["index"]: e for e in load("Equipment")}

PHB_SUBCLASSES = {
    "barbarian": ["Totem Warrior"],
    "bard": ["Valor"],
    "cleric": ["Knowledge", "Light", "Nature", "Tempest", "Trickery", "War"],
    "druid": ["Moon"],
    "fighter": ["Battle Master", "Eldritch Knight"],
    "monk": ["Shadow", "Four Elements"],
    "paladin": ["Ancients", "Vengeance"],
    "ranger": ["Beast Master"],
    "rogue": ["Assassin", "Arcane Trickster"],
    "sorcerer": ["Wild Magic"],
    "warlock": ["Archfey", "Great Old One"],
    "wizard": ["Abjuration", "Conjuration", "Divination", "Enchantment", "Illusion", "Necromancy", "Transmutation"],
}
SUBCLASS_LEVEL = {"cleric": 1, "sorcerer": 1, "warlock": 1, "druid": 2, "wizard": 2}
PREPARED = {"cleric": "full", "druid": "full", "wizard": "full", "paladin": "half", "artificer": "half"}


def option_label(o):
    t = o.get("option_type")
    if t == "counted_reference":
        n = o["count"]
        return (f"{n} × " if n > 1 else "") + o["of"]["name"]
    if t == "reference":
        return o["item"]["name"]
    if t == "multiple":
        return " + ".join(filter(None, (option_label(x) for x in o["items"])))
    if t == "choice":
        ch = o["choice"]
        cat = ch["from"].get("equipment_category")
        if cat:
            return (f"{ch['choose']} × " if ch["choose"] > 1 else "") + "any " + cat["name"]
        return ch.get("desc", "choice")
    return None


classes = []
for c in load("Classes"):
    cid = c["index"]
    skill_choice = c["proficiency_choices"][0]
    sc = c.get("spellcasting")
    lvls = sorted([l for l in levels if l["class"]["index"] == cid and not l.get("subclass")],
                  key=lambda l: l["level"])
    prog = []
    for l in lvls:
        sp = l.get("spellcasting") or {}
        prog.append({
            "level": l["level"],
            "prof": l["prof_bonus"],
            "features": [f["name"] for f in l["features"]],
            "cantrips": sp.get("cantrips_known", 0),
            "known": sp.get("spells_known", 0),
            "slots": [sp.get(f"spell_slots_level_{i}", 0) for i in range(1, 10)],
            "special": l.get("class_specific") or {},
        })
    feats = [{"name": f["name"], "level": f["level"], "desc": text(f["desc"])}
             for f in features if f["class"]["index"] == cid and not f.get("subclass")
             and not f.get("parent")]
    subclasses = []
    for s in c["subclasses"]:
        sfeats = [{"name": f["name"], "level": f["level"], "desc": text(f["desc"])}
                  for f in features if (f.get("subclass") or {}).get("index") == s["index"]]
        subclasses.append({"id": s["index"], "name": s["name"], "srd": True, "features": sfeats})
    for n in PHB_SUBCLASSES.get(cid, []):
        subclasses.append({"id": slug(n), "name": n, "srd": False, "features": []})
    start = [(f"{e['quantity']} × " if e["quantity"] > 1 else "") + e["equipment"]["name"]
             for e in c["starting_equipment"]]
    start_opts = []
    for o in c["starting_equipment_options"]:
        frm = o["from"]
        if frm.get("option_set_type") == "options_array":
            opts = [x for x in (option_label(op) for op in frm["options"]) if x]
        else:
            opts = ["any " + frm["equipment_category"]["name"]]
        start_opts.append({"desc": o.get("desc", ""), "options": opts})
    profs = [p["name"] for p in c["proficiencies"] if not p["index"].startswith("saving-throw")]
    classes.append({
        "id": cid,
        "name": c["name"],
        "hitDie": c["hit_die"],
        "saves": [s["index"] for s in c["saving_throws"]],
        "proficiencies": profs,
        "skillChoice": {
            "choose": skill_choice["choose"],
            "from": [o["item"]["index"].replace("skill-", "") for o in skill_choice["from"]["options"]
                     if "item" in o and o["item"]["index"].startswith("skill-")],
        },
        "spellAbility": sc["spellcasting_ability"]["index"] if sc else None,
        "prepared": PREPARED.get(cid),
        "subclassLevel": SUBCLASS_LEVEL.get(cid, 3),
        "subclassFlavor": next((s.get("subclass_flavor") for s in load("Subclasses")
                                if s["class"]["index"] == cid), ""),
        "progression": prog,
        "features": feats,
        "subclasses": subclasses,
        "startingEquipment": start,
        "startingEquipmentOptions": start_opts,
    })

# ---------------------------------------------------------------- backgrounds (PHB facts)
BACKGROUNDS = [
    ("acolyte", "Acolyte", ["insight", "religion"], [], 2, "Shelter of the Faithful", 15),
    ("charlatan", "Charlatan", ["deception", "sleight-of-hand"], ["Disguise kit", "Forgery kit"], 0, "False Identity", 15),
    ("criminal", "Criminal", ["deception", "stealth"], ["One type of gaming set", "Thieves' tools"], 0, "Criminal Contact", 15),
    ("entertainer", "Entertainer", ["acrobatics", "performance"], ["Disguise kit", "One type of musical instrument"], 0, "By Popular Demand", 15),
    ("folk-hero", "Folk Hero", ["animal-handling", "survival"], ["One type of artisan's tools", "Vehicles (land)"], 0, "Rustic Hospitality", 10),
    ("guild-artisan", "Guild Artisan", ["insight", "persuasion"], ["One type of artisan's tools"], 1, "Guild Membership", 15),
    ("hermit", "Hermit", ["medicine", "religion"], ["Herbalism kit"], 1, "Discovery", 5),
    ("noble", "Noble", ["history", "persuasion"], ["One type of gaming set"], 1, "Position of Privilege", 25),
    ("outlander", "Outlander", ["athletics", "survival"], ["One type of musical instrument"], 1, "Wanderer", 10),
    ("sage", "Sage", ["arcana", "history"], [], 2, "Researcher", 10),
    ("sailor", "Sailor", ["athletics", "perception"], ["Navigator's tools", "Vehicles (water)"], 0, "Ship's Passage", 10),
    ("soldier", "Soldier", ["athletics", "intimidation"], ["One type of gaming set", "Vehicles (land)"], 0, "Military Rank", 10),
    ("urchin", "Urchin", ["sleight-of-hand", "stealth"], ["Disguise kit", "Thieves' tools"], 0, "City Secrets", 10),
]
srd_bg = {b["index"]: b for b in load("Backgrounds")}
backgrounds = []
for bid, name, skills, tools, langs, feat, gold in BACKGROUNDS:
    b = {"id": bid, "name": name, "skills": skills, "tools": tools, "languages": langs,
         "feature": {"name": feat, "desc": ""}, "gold": gold}
    if bid in srd_bg:
        b["feature"]["desc"] = text(srd_bg[bid]["feature"]["desc"])
        b["srd"] = True
    backgrounds.append(b)

# ---------------------------------------------------------------- equipment
weapons, armor = [], []
for e in equipment.values():
    cat = e["equipment_category"]["index"]
    if cat == "weapon":
        weapons.append({
            "id": e["index"], "name": e["name"], "category": e["weapon_category"],
            "range": e["weapon_range"],
            "damage": (e.get("damage") or {}).get("damage_dice", ""),
            "damageType": ((e.get("damage") or {}).get("damage_type") or {}).get("index", ""),
            "versatile": (e.get("two_handed_damage") or {}).get("damage_dice"),
            "properties": [p["index"] for p in e.get("properties", [])],
            "normalRange": (e.get("range") or {}).get("normal"),
            "longRange": (e.get("range") or {}).get("long"),
        })
    elif cat == "armor":
        ac = e["armor_class"]
        armor.append({
            "id": e["index"], "name": e["name"], "category": e["armor_category"],
            "base": ac["base"], "dex": ac["dex_bonus"], "maxDex": ac.get("max_bonus"),
            "strMin": e.get("str_minimum", 0), "stealthDis": e.get("stealth_disadvantage", False),
        })

# ---------------------------------------------------------------- spells
srd_spells = {slug(s["name"]): s for s in load("Spells")}
CLASS_CODE = {"b": "bard", "c": "cleric", "d": "druid", "p": "paladin", "r": "ranger",
              "s": "sorcerer", "k": "warlock", "w": "wizard", "a": "artificer"}
SOURCE = {"Player´s Handbook (SRD)": "PHB", "Player´s Handbook": "PHB", "Player´s Handbook (BR+)": "PHB",
          "Xanathar´s Guide to Everything": "XGE", "Tasha´s Cauldron of Everything": "TCE"}
row_re = re.compile(r"<tr><td class=\"nocel\">.*?</tr>", re.S)
cell_re = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
spells = {}
for code, cls in CLASS_CODE.items():
    with open(os.path.join(AIDEDD, f"class_{code}.html"), encoding="utf-8", errors="ignore") as f:
        h = f.read()
    for row in row_re.findall(h):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in cell_re.findall(row)]
        vo = re.search(r"sorts\.php\?vo=([a-z0-9-]+)", row).group(1)
        # cells: [checkbox, name, lvl, school, casting, range, comps, conc, ritual, descr, source]
        name = cells[1]
        sp = spells.setdefault(vo, {
            "id": vo,
            "name": name,
            "level": int(cells[2]),
            "school": cells[3].lower(),
            "castingTime": cells[4],
            "range": cells[5],
            "components": cells[6],
            "concentration": bool(cells[7]),
            "ritual": bool(cells[8]),
            "source": SOURCE.get(cells[10], cells[10]),
            "srd": "(SRD)" in cells[10],
            "classes": [],
        })
        sp["classes"].append(cls)

missing = []
for sp in spells.values():
    # The SRD drops the wizard's name from named spells ("Leomund's Tiny Hut" -> "Tiny Hut").
    alias = {"Mordenkainen's Sword": "Arcane Sword", "Bigby's Hand": "Arcane Hand",
             "Nystul's Magic Aura": "Arcanist's Magic Aura"}.get(sp["name"])
    s = (srd_spells.get(slug(alias or sp["name"]))
         or srd_spells.get(slug(re.sub(r"^\w+'s ", "", sp["name"]))))
    if s:
        sp["duration"] = s["duration"]
        sp["material"] = s.get("material", "")
        sp["desc"] = text(s["desc"])
        sp["higherLevel"] = text(s.get("higher_level"))
    elif sp["srd"]:
        missing.append(sp["name"])

spell_list = sorted(spells.values(), key=lambda s: (s["level"], s["name"]))

os.makedirs(OUT, exist_ok=True)
for name, data in [("races", races), ("classes", classes), ("backgrounds", backgrounds),
                   ("weapons", sorted(weapons, key=lambda w: w["name"])),
                   ("armor", armor), ("spells", spell_list)]:
    with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

print(f"races {len(races)}, classes {len(classes)}, backgrounds {len(backgrounds)}, "
      f"weapons {len(weapons)}, armor {len(armor)}, spells {len(spell_list)} "
      f"(with SRD text {sum(1 for s in spell_list if 'desc' in s)})")
if missing:
    print("SRD spells without matched text:", missing)
