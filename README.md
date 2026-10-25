# Campaign Codex — D&D 5e campaign manager

A bilingual (English / עברית) web app for running D&D 5e campaigns:

- **Platform manager** (you) creates campaigns and assigns a Dungeon Master to each one.
- **Dungeon Master** invites players with a link, keeps a session log and private notes, and can view and edit every sheet in their campaign.
- **Players** accept the invite, build a character with a step-by-step wizard, and play from an interactive three-page character sheet modelled on the official 5e sheet.

Everyone signs in with Google.

## Try it right now (no setup)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without Firebase settings the app runs in **demo mode**: data lives in your browser and the sign-in screen lets you switch between a manager, a DM and two players to try the whole flow.

## Going live with Google sign-in (Firebase)

1. **Create a Firebase project** at https://console.firebase.google.com (the free Spark plan is enough).
2. **Turn on Google sign-in**: Build → Authentication → Get started → Sign-in method → Google → Enable.
3. **Create the database**: Build → Firestore Database → Create database → production mode → pick a region close to your players (e.g. `europe-west`).
4. **Register a web app**: Project settings (gear) → Your apps → `</>` → give it a name. Copy the config values.
5. **Configure the app**: copy `.env.example` to `.env` and paste the values:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_ADMIN_EMAILS=you@gmail.com
   ```
6. **Set yourself as platform manager** in two places (they must match): `VITE_ADMIN_EMAILS` in `.env`, and the list inside `isAdmin()` in [firestore.rules](firestore.rules). Use the Google account you will sign in with.
7. **Deploy the rules, indexes and the site**:
   ```bash
   npx firebase login
   npx firebase use --add          # pick your project
   npm run build
   npx firebase deploy
   ```
   The site is then live at `https://your-project.web.app`.
8. If you host somewhere else, add that domain under Authentication → Settings → Authorized domains.

## How the flow works

1. Platform → **New campaign**: name, setting, starting level, and the DM's Google email. The DM roster lives under Platform → Dungeon Masters.
2. The DM signs in, opens the campaign → **Invitations** → creates a link (optionally locked to one email, with an expiry) and sends it.
3. The player opens the link, signs in with Google, presses **Join the campaign**, then **Create your character**.
4. The wizard walks through race, class & level, ability scores (standard array / point buy / 4d6 / manual), background & skills, equipment, spells, and details. The finished sheet computes modifiers, saves, skills, passive perception, AC, HP, attacks, spell DC and slots.
5. Sheets autosave. Owners and the DM can edit; the rest of the party can view. **Level up** adds average HP and new class features. **Print** produces the three pages. **☾ Short rest** spends hit dice (rolled with Con), shows exactly which features recharge (Second Wind, Ki, pact slots…) and offers Arcane / Natural Recovery and Song of Rest; **☀ Long rest** lists everything it restores before applying it.
6. **🏠 Homebrew** (campaign tab): the DM writes the campaign's own spells (on the class lists they pick) and abilities (with uses like `3`, `prof`, `level*5`, a short/long rest recharge, and dice like `1d8+wis`), and grants either to specific characters. Approved spells appear in spell lists and cast like book spells; abilities get bubbles on the sheet, a card on the Class features tab and refill on rests. Players can suggest items for their own character; the DM approves them first.

## Importing a character from a PDF

Players who already have a filled-in sheet can bring it in: campaign page → **Import from PDF**. It reads the
form-fillable 5e character sheet (the standard three-page PDF with typed-in fields): name, race, class & level,
background, ability scores, save and skill proficiency dots (expertise is inferred from the skill bonus), AC, HP,
attacks, coins, gear, personality, notes, page-2 details, and spells — matched against the compendium by English or
Hebrew name, with the "prepared" dots and used spell slots. Anything not recognised (e.g. homebrew spells) is kept in
*Additional Features & Traits*, and the player can correct race, class, level and background before saving.
Scanned or "printed to PDF" sheets have no form fields and cannot be read directly — for those, the
**🤖 AI helper** on the import screen gives the player a detailed prompt to paste into ChatGPT, Claude or Gemini
together with their sheet; the assistant builds a fillable PDF with exactly the fields the importer reads
(`src/lib/importSpec.ts` is the single list both the prompt and the importer use).

Tests: `npm run test:unit` (dice, PDF import, spells, casting, rests…); `npm run test:rules` (security rules, needs Java 11+).

## Data sources

- Rules text: the D&D 5e **SRD 5.1** (CC-BY-4.0, Wizards of the Coast) via the 5e-bits database — races, classes, level tables, features, equipment and the full text of 319 spells.
- Spell lists: [aidedd.org](https://www.aidedd.org/dnd-filters/spells-5e.php) — names, levels, schools, casting details and class lists for 477 spells from the PHB, Xanathar's and Tasha's. Spells outside the SRD show their stats and link to aidedd for the full text.
- Player's Handbook options not in the SRD (extra subraces, subclasses and the 13 backgrounds) are included as names and mechanics only.
- Extra races beyond the PHB: **Goliath** (Volo's Guide), **Changeling** (Eberron: Rising from the Last War) and **Orc** (2024 PHB; its ability increases use the flexible +2/+1 or +1/+1/+1 choice, since the app's 2014 backgrounds give none), plus the PHB race skill grants (elf, half-orc, half-elf), from `scripts/races_extra.json` via `npm run data:merge`.
- Hebrew names for every spell, race, class, feature and item are in `src/data/he.json`; rule descriptions stay in English.

- **Classes were audited page by page against the 2014 Player's Handbook** (`scripts/phb_audit/<class>.json`): every level-table
  column, every class and subclass feature with its level, choice options (fighting styles, invocations, maneuvers,
  metamagic, disciplines…), subclass spell lists and limited-use resources (Lay on Hands, Rage, Ki…). Feature summaries
  are written in our own words. `npm run data:merge` folds the audit into `src/data/classes.json` and prints every change
  (`scripts/phb_audit/MERGE_REPORT.txt`); `tests/classData.test.mts` keeps every class consistent with the book.

To rebuild the data files: `python3 -I scripts/build_data.py <srd-json-dir> <aidedd-html-dir> src/data`, then `npm run data:merge`.

## Project layout

```
src/lib/        backend interface, Firebase + demo backends, rules math, i18n
src/pages/      dashboard, platform console, campaign, invite, wizard, sheet page, spells
src/sheet/      the three-page character sheet
src/data/       generated 5e data + Hebrew names
firestore.rules who can read/write what
```
