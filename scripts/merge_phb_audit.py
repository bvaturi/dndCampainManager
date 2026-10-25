"""Merge the PHB class audit (scripts/phb_audit/<class>.json) into src/data/classes.json.

Usage: python3 -I scripts/merge_phb_audit.py            (run after build_data.py; safe to run repeatedly)

For every class with an audit file:
- class features: attach the own-words summary and resource (limited uses); add features the SRD data lacks;
  the book's level wins when they disagree;
- level table: store the class-specific columns (Rages, Ki Points, Sneak Attack, …) and the book's feature names;
- subclasses: merge features (adds all features for the PHB-only subclasses), subclass spell lists, options and
  one-third-caster spellcasting tables;
- class options (fighting styles, invocations, metamagic, …).
Prints a report of every change and every remaining inconsistency.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSES = os.path.join(ROOT, "src", "data", "classes.json")
AUDIT = os.path.join(ROOT, "scripts", "phb_audit")


def norm(s):
    s = re.sub(r"^Spellcasting:.*$", "Spellcasting", s)
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def base_name(name):
    """SRD splits scaling features into copies like "Bardic Inspiration (d8)" or "Brutal Critical (2 dice)"."""
    return norm(re.sub(r"\s*\([^)]*\)\s*$", "", name))


def rebuild_features(srd, audited, where, report):
    """The book's feature list becomes the source; SRD rules text is attached where the names match."""
    srd_by = {}
    for f in sorted(srd, key=lambda f: f["level"]):
        if f.get("desc"):
            srd_by.setdefault(base_name(f["name"]), f)
    out, used = [], set()
    for a in audited:
        src = srd_by.get(base_name(a["name"]))
        if src:
            used.add(base_name(src["name"]))
            if src["level"] != a["level"] and not re.search(r"improvement", a["name"], re.I):
                report.append(f"{where}: '{a['name']}' level {src['level']} -> {a['level']} (book)")
        elif srd:
            report.append(f"{where}: added '{a['name']}' (level {a['level']})")
        f = {"name": a["name"], "level": a["level"], "desc": src["desc"] if src else ""}
        if a.get("summary"):
            f["summary"] = a["summary"]
        if a.get("resource"):
            f["resource"] = a["resource"]
        out.append(f)
    dropped = sorted({f["name"] for f in srd if base_name(f["name"]) not in used})
    if dropped:
        report.append(f"{where}: removed SRD duplicates/placeholders {dropped}")
    return sorted(out, key=lambda f: f["level"])


def main():
    with open(CLASSES, encoding="utf-8") as f:
        classes = json.load(f)
    report, problems = [], []
    for cls in classes:
        path = os.path.join(AUDIT, cls["id"] + ".json")
        if not os.path.exists(path):
            problems.append(f"{cls['id']}: no audit file")
            continue
        with open(path, encoding="utf-8") as f:
            audit = json.load(f)
        cid = cls["id"]

        # --- basics: report differences, the book wins
        if audit.get("hitDie") and audit["hitDie"] != cls["hitDie"]:
            report.append(f"{cid}: hit die d{cls['hitDie']} -> d{audit['hitDie']}")
            cls["hitDie"] = audit["hitDie"]
        if audit.get("saves") and sorted(audit["saves"]) != sorted(cls["saves"]):
            report.append(f"{cid}: saves {cls['saves']} -> {audit['saves']}")
            cls["saves"] = audit["saves"]
        sc = audit.get("skillChoice")
        if sc and (sc["choose"] != cls["skillChoice"]["choose"] or sorted(sc["from"]) != sorted(cls["skillChoice"]["from"])):
            report.append(f"{cid}: skill choice {cls['skillChoice']} -> {sc}")
            cls["skillChoice"] = sc

        # --- level table
        rows = {r["level"]: r for r in audit.get("table", [])}
        if len(rows) != 20:
            problems.append(f"{cid}: audit table has {len(rows)} rows")
        for prog in cls["progression"]:
            r = rows.get(prog["level"])
            if not r:
                continue
            if r.get("prof") and r["prof"] != prog["prof"]:
                report.append(f"{cid} L{prog['level']}: proficiency {prog['prof']} -> {r['prof']}")
                prog["prof"] = r["prof"]
            prog["features"] = r.get("features", prog["features"])
            prog["columns"] = r.get("columns", {})

        # --- class features
        cls["features"] = rebuild_features(cls["features"], audit.get("features", []), cid, report)
        profs = audit.get("armor", []) + audit.get("weapons", []) + audit.get("tools", [])
        if profs and sorted(profs) != sorted(cls["proficiencies"]):
            report.append(f"{cid}: proficiencies {cls['proficiencies']} -> {profs}")
            cls["proficiencies"] = profs
        if audit.get("options"):
            cls["options"] = audit["options"]

        # --- subclasses
        subs = {s["id"]: s for s in cls["subclasses"]}
        by_name = {norm(s["name"]): s for s in cls["subclasses"]}
        for a in audit.get("subclasses", []):
            s = subs.get(a["id"]) or by_name.get(norm(a["name"])) or by_name.get(norm(a.get("fullName", "")))
            if not s:
                s = {"id": a["id"], "name": a["name"], "srd": False, "features": []}
                cls["subclasses"].append(s)
                report.append(f"{cid}: added subclass '{a['name']}'")
            if a.get("fullName"):
                s["fullName"] = a["fullName"]
            if a.get("name") and a["name"] != s["name"]:
                report.append(f"{cid}/{s['id']}: name '{s['name']}' -> '{a['name']}' (book)")
                s["name"] = a["name"]
            if not s["features"] and a.get("features"):
                report.append(f"{cid}/{s['id']}: added {len(a['features'])} features (was empty)")
            s["features"] = rebuild_features(s["features"], a.get("features", []), f"{cid}/{s['id']}", report)
            for key in ("spells", "options", "spellcasting", "spellsByTerrain"):
                if a.get(key):
                    s[key] = a[key]
        for s in cls["subclasses"]:
            if not s["features"]:
                problems.append(f"{cid}/{s['id']}: subclass has no features")

        # --- consistency: every named feature in the table exists at that level
        # Scaling repeats ("Brutal Critical (2 dice)", "Expertise", "Metamagic") refer to a feature gained earlier.
        gained = [(base_name(f["name"]), f["level"]) for f in cls["features"]]
        for prog in cls["progression"]:
            for n in prog["features"]:
                if re.search(r"feature|improvement", n, re.I):
                    continue
                if not any(k == base_name(n) and lv <= prog["level"] for k, lv in gained):
                    problems.append(f"{cid} L{prog['level']}: table lists '{n}' but no class feature by that name")

    with open(CLASSES, "w", encoding="utf-8") as f:
        json.dump(classes, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(report)} changes:")
    for line in report:
        print("  +", line)
    print(f"{len(problems)} problems:")
    for line in problems:
        print("  !", line)
    for cls in classes:
        print(f"{cls['id']:10s} features {len(cls['features']):3d} | subclasses {len(cls['subclasses'])} "
              f"({sum(len(s['features']) for s in cls['subclasses'])} features) | "
              f"resources {sum(1 for f in cls['features'] if f.get('resource')) + sum(1 for s in cls['subclasses'] for f in s['features'] if f.get('resource'))}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
