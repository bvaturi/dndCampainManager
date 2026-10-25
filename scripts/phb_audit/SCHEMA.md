# PHB class audit — output format (one file per class: scripts/phb_audit/<classId>.json)

```jsonc
{
  "class": "paladin",                 // our class id
  "pdfPages": "83-89",
  "hitDie": 10,
  "saves": ["wis", "cha"],            // ability ids: str dex con int wis cha
  "armor": ["Light Armor", "Medium Armor", "Heavy Armor", "Shields"],
  "weapons": ["Simple Weapons", "Martial Weapons"],
  "tools": [],
  "skillChoice": { "choose": 2, "from": ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"] },  // skill ids, kebab-case
  "spellcasting": { "ability": "cha", "startsAt": 2 } ,   // or null
  "table": [                          // EXACTLY 20 rows, every column of the class table in the book
    { "level": 1, "prof": 2, "features": ["Divine Sense", "Lay on Hands"],
      "columns": { "1st": 0, "2nd": 0 } }               // every extra column, keyed by the book's column header
  ],
  "features": [                       // every class feature (NOT subclass), one entry per feature name, at the level it is gained
    { "name": "Lay on Hands", "level": 1,
      "summary": "Own words, max ~30 words, describing what it does mechanically.",
      "resource": { "key": "lay-on-hands", "label": "Healing pool", "max": "5*level", "recharge": "long" } }  // or omit when no limited uses
  ],
  "options": [                        // choices inside a feature (fighting styles, invocations, metamagic, pact boons, …)
    { "feature": "Fighting Style", "choices": [ { "name": "Defense", "summary": "Own words.", "prerequisite": "" } ] }
  ],
  "subclasses": [                     // EVERY subclass in the PHB for this class
    { "id": "devotion", "name": "Devotion", "fullName": "Oath of Devotion",
      "features": [ { "name": "Sacred Weapon", "level": 3, "summary": "Own words.", "resource": null } ],
      "spells": { "3": ["Protection from Evil and Good", "Sanctuary"] },   // subclass spell list by class level, if the book has one
      "options": []
    }
  ],
  "discrepancies": [ "Plain-English list of every difference between the book and src/data/classes.json for this class" ]
}
```

Resource `max` is a number or an expression using: numbers, `level` (class level), `prof` (proficiency bonus),
ability modifiers `str dex con int wis cha`, `table:<Column header>` (value from this class's table at the current level),
`+ - *`, and `max(a,b)` / `min(a,b)`. Examples: `"5*level"`, `"max(1,cha)"`, `"table:Rages"`, `"1+cha"`.
If the count changes at set levels, add `"byLevel": {"2": 1, "6": 2, "18": 3}` (value from that level on) instead of `max`.
`recharge` is `"short"` or `"long"`; if it changes (e.g. Bardic Inspiration becomes short rest at 5th), add
`"shortRestFrom": 5`. Use a stable kebab-case `key`, unique within the class.

Rules:
- Feature NAMES exactly as printed in the book. Levels exactly as in the class table / subclass text.
- Summaries in your OWN WORDS (the book is copyrighted): short, mechanical, no copied sentences.
- Subclass `id`: use the id already in src/data/classes.json for that subclass when it exists (e.g. "devotion",
  "battle-master", "school-of-…" → look it up); otherwise kebab-case of the short name.
- `columns` values: numbers as numbers ("2", "+3" → 2, 3 for counts; keep strings like "1d6", "+10 ft.", "Unlimited" as strings).
