/**
 * Builds the "AI helper" prompt: the player pastes it into an AI assistant (ChatGPT, Claude, Gemini…) together
 * with their messy sheet (scan, photo, flattened PDF), and gets back a form-fillable PDF this app imports cleanly.
 */
import { FEATS } from './feats'
import { IMPORT_FIELDS, type FieldSpec } from './importSpec'
import { BACKGROUNDS, CLASSES, RACES, SKILLS } from './rules'

const SOURCE_NAMES: Record<string, string> = { VGM: "Volo's Guide to Monsters", ERLW: 'Eberron: Rising from the Last War', PHB24: "Player's Handbook (2024)" }

const GROUP_TITLES: Record<FieldSpec['group'], string> = {
  identity: 'Identity',
  abilities: 'Ability scores',
  proficiencies: 'Proficiencies & feats',
  combat: 'Combat',
  gear: 'Money & gear',
  personality: 'Personality & features',
  details: 'Appearance & story',
  spells: 'Spells',
}

const FORMAT_RULE: Record<FieldSpec['format'], string> = {
  text: 'single-line text',
  number: 'digits only (no "+", no units)',
  multiline: 'multi-line text',
  list: 'list — one item per line',
}

export function buildImportPrompt(opts: { lang: 'en' | 'he'; characterName?: string }): string {
  const groups = Object.keys(GROUP_TITLES) as FieldSpec['group'][]
  const table = groups.map((g) => {
    const rows = IMPORT_FIELDS.filter((f) => f.group === g).map((f) => `| \`${f.name}\` | ${FORMAT_RULE[f.format]} | ${f.hint} |`)
    return `**${GROUP_TITLES[g]}**\n\n| Field name (exact) | Format | What to put in it |\n|---|---|---|\n${rows.join('\n')}`
  }).join('\n\n')

  const races = RACES.map((r) => (r.subraces.length ? `${r.name} (${r.subraces.map((s) => s.name).join(', ')})` : r.name) + (r.source ? ` [${SOURCE_NAMES[r.source] ?? r.source}]` : '')).join('; ')
  const classes = CLASSES.map((c) => `${c.name}: ${c.subclasses.map((s) => (s.fullName && s.fullName !== s.name ? `${s.name} (${s.fullName})` : s.name)).join(', ')}`).join('\n- ')
  const multiline = IMPORT_FIELDS.filter((f) => f.format === 'multiline' || f.format === 'list').map((f) => `"${f.name}"`).join(', ')
  const order = IMPORT_FIELDS.map((f) => `"${f.name}"`).join(', ')

  return `# Task: turn my D&D 5e character sheet into an import-ready fillable PDF

I've attached my Dungeons & Dragons 5th edition character sheet${opts.characterName ? ` for **${opts.characterName}**` : ''}. It may be a scan, a photo, a flattened or unusual PDF, or a sheet from another tool. My campaign manager app can only import a **form-fillable PDF (AcroForm) whose fields have the exact names listed below**. Please read my sheet carefully and create that PDF for me.

${opts.lang === 'he' ? '**Please talk to me in Hebrew**, but keep the field names and the official game names (below) in English exactly as written.\n\n' : ''}## Step 1 — Read the sheet

- Read every page. Extract each value into the matching field below.
- Copy values exactly as written on my sheet. **Do not invent, calculate or "fix" anything** — if a value is missing or unreadable, leave the field empty.
- If something is ambiguous or unreadable (handwriting, cut-off text), **list those items and ask me** before building the file. Otherwise go straight to Step 2.
- Ability fields (\`STR\`…\`CHA\`) take the **score** (e.g. 15), never the modifier (+2).
- Free text (backstory, notes, equipment…) stays in the original language of my sheet — Hebrew is fine.

## Step 2 — Use official English game names

The app matches these names against its rules database, so write them in their official English (Player's Handbook) form even if my sheet uses another language or abbreviations:

- **Races** (subraces in brackets): ${races}
- **Classes and subclasses** (write the short subclass name before the brackets in \`Subclass\`):
- ${classes}
- **Backgrounds:** ${BACKGROUNDS.map((b) => b.name).join(', ')}
- **Abilities:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma
- **Skills:** ${SKILLS.map((s) => s.en).join(', ')}
- **Feats:** ${FEATS.map((f) => f.name).join(', ')} (anything else: write its name as on my sheet)
- **Spells:** the official English spell name, e.g. "Cure Wounds", "Tasha's Hideous Laughter". One spell per line, in the field for its spell level. Homebrew spells: write the name as on my sheet.

## Step 3 — The fields (names are case- and space-sensitive)

${table}

Rules for the fields:
- Create **every** field above, even if it stays empty. Field names must match **character for character** (e.g. \`Wpn Name 2\` has spaces, \`Feat+Traits\` has a plus sign).
- Use **text fields only** (no checkboxes) — proficiencies, spells and feats go in the list fields.
- List fields: one item per line, nothing else (no bullets or numbering).
- Number fields: digits only. Speed "30 ft." → \`30\`. Leave empty rather than writing "—" or "N/A".

## Step 4 — Build the PDF (Python recipe)

Appearance doesn't matter; correct field names and values do. This recipe works (reportlab for the fields, pypdf to store the values as Unicode so Hebrew survives):

\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

ORDER = [${order}]
MULTILINE = {${multiline}}
VALUES = {
    # "CharacterName": "…",  ← fill from the sheet; use "\\n" between list items
}

c = canvas.Canvas("blank.pdf", pagesize=letter)
y = 750
for name in ORDER:
    h = 64 if name in MULTILINE else 18
    if y - h < 40:
        c.showPage(); y = 750
    c.setFont("Helvetica", 7)
    c.drawString(36, y, name)  # visible label for humans
    c.acroForm.textfield(name=name, x=36, y=y - h - 2, width=540, height=h, borderWidth=0.5,
                         fieldFlags="multiline" if name in MULTILINE else "", forceBorder=True)
    y -= h + 16
c.save()

writer = PdfWriter()
writer.append(PdfReader("blank.pdf"))
for page in writer.pages:
    for ref in page.get("/Annots", []):
        annot = ref.get_object()
        name = annot.get("/T")
        if name in VALUES and VALUES[name] != "":
            annot[NameObject("/V")] = TextStringObject(str(VALUES[name]))
writer.set_need_appearances_writer(True)
writer.write("character-import.pdf")
\`\`\`

## Step 5 — Check before you give me the file

1. Re-open \`character-import.pdf\` with \`PdfReader(...).get_fields()\` and print a table of **field name → value**.
2. Confirm that every field name in Step 3 exists, that no extra or misspelled names were created, and that the abilities are scores (3–20).
3. Then give me the **download link to \`character-import.pdf\`** and a short summary: name, race, class & level, and how many skills, attacks, spells and feats you filled in.

If you cannot run code or create files, say so, and instead give me the complete \`VALUES\` dictionary so I can run the script myself.`
}
