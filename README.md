# Stormkeep campaign manager

A Google-authenticated D&D campaign workspace with English/Hebrew support, multiple campaigns, multiple DMs, private character sheets, and a shared Party journal. Character automation uses the 2014 rules: Tempest cleric / legacy Goliath and bard / Eberron Changeling.

Each campaign has its own members and DMs. Players edit their own characters; current campaign DMs can view, edit, and reassign all its characters. The verified Google account `barakv01@gmail.com` is the platform administrator. Only this account creates campaigns, assigns/removes DMs, and creates DM invitations. It can manage all campaigns. Other accounts see only campaigns they belong to; DM access applies only within assigned campaigns. DMs can invite and remove players, but cannot appoint DMs or remove another DM. Invitations are linked to a verified Google email and expire after seven days. Campaign-access invite links are copied manually. Session invitations are sent through Google Calendar with email notifications. Each assigned DM sees all player invitations for their campaign, so pending players can be included in a session; admin-created DM invitations remain private to the admin and invited account. The admin sees all invitations in a campaign. New DMs accept an admin-created DM invitation; existing members can be promoted with Make DM in the admin console. Removing a member revokes their campaign access and their original invitation.

Party shows automatically updated character summaries and portraits plus shared notes, quests, session entries, loot, and clickable links. Add link supports a title, HTTP/HTTPS URL, optional details, and author/DM editing. Equipment, character notes, balances, and backstories remain inside the private sheet. DM notebooks are stored separately and never downloaded by player queries.

## Using the app

1. Continue with Google. The admin creates campaigns; other accounts open an invitation link using the invited Google account.
2. Open the Admin console to assign DMs or invite them with Invitation role → DM. Assigned DMs use their DM console to invite players, assign characters, and define campaign currencies.
3. Create a cleric/bard sheet or import an existing sheet's JSON backup. Import the latest backup from the original site to preserve levels and balances; no PDF-derived data overwrites existing saves.
4. Use My characters for your sheets and Party for the shared journal. Sheets autosave and have an explicit Save button. Save conflicts stop autosave so you can export your edits before reloading.
5. In Equipment & story, upload a PNG/JPEG/WebP portrait (up to 8 MB) or use a direct HTTPS image URL. Uploads are resized to at most 600 pixels, re-encoded, and stored with the sheet and its Party summary. Clearing a portrait clears its shared summary. The bounded embedded portrait needs no Storage bucket. Backups include images.
6. In a wallet, select a default currency, add coins, or record a purchase with a price and tender. Change is calculated within that currency using its configured conversion rates. Different currencies are not exchanged automatically.

The original Sites app and its saves are independent of this app. Production has no preview login or fictional seeded characters. Development preview is a clearly labelled, in-memory fixture that resets on refresh.

## Local development

Requires Node 24.12+ (24 LTS recommended), npm, and Java 21 for security-rule tests.

```sh
npm ci
npm run dev
npm test
npm run test:rules
npm run build
```

`npm run preview:local` starts the fictional UI fixture. `?previewUser=dm`, `player`, or `other` chooses a fixture account only in this development mode.

The checked-in `lib/firebase-config.json` contains public browser SDK configuration, not administrative credentials. You can override it with `VITE_FIREBASE_CONFIG` (a JSON object) and `VITE_FIRESTORE_DATABASE` in an ignored `.env.local`. Keep CLI credentials, service-account keys, exports, and private character backups out of Git.

## Firebase deployment

Project: `stormkeep-barakv01`. Firestore: named `campaigns` database, Enterprise edition, Native API access and realtime updates enabled, MongoDB access disabled, in Tel Aviv (`me-west1`). Hosting supplies HTTPS at `https://stormkeep-barakv01.web.app` and `https://stormkeep-barakv01.firebaseapp.com`. A custom domain can be connected in Firebase Hosting after choosing a domain and configuring its DNS.

```sh
npx firebase-tools@latest login
npm run deploy
```

The deploy command selects `barakv01@gmail.com`. Sign into the correct account first. The app needs Google sign-in configured; `firebase.json` contains the provider and authorized domains. GitHub Actions checks the build, unit tests, and security tests on pushes and pull requests. Firebase releases are deployed with the command above; the repository contains no deployment credential.

For a fresh Firebase project, create the database explicitly before the first deploy:

```sh
npx firebase-tools@latest firestore:databases:create campaigns --project YOUR_PROJECT --location me-west1 --edition enterprise --firestore-data-access ENABLED --mongodb-compatible-data-access DISABLED --realtime-updates ENABLED
```

Update the public web SDK config, `.firebaserc`, auth domains, and support email for that project. `dataAccessMode: FIRESTORE_NATIVE` in the Firestore configuration prevents the CLI from provisioning a MongoDB database by default.

## Data and permissions

Firestore paths:

- `campaigns/{id}`: bounded campaign metadata, member/DM UIDs, creator, timestamps, and currency index.
- `members/{uid}`: display name, joined time and invitation reference; no login emails.
- `currencies/{id}`: campaign currency names and conversion rates.
- `invitations/{id}`: email-bound, expiring invitations; player invitations are visible to assigned campaign DMs and the intended verified account; DM invitations stay admin-only apart from the intended account.
- `characters/{id}`: private core statistics, owner, type, revision, updater and wallet index.
- Character subcollections `details`, `spells`, `history`, and `wallets`: private bounded data validated separately to stay within Firestore's evaluation limits.
- `summaries/{id}`: an exact safe projection of the character core, written atomically with the sheet.
- `notes/{id}`: shared journal; authors edit their own entries and DMs edit any.
- `dmNotes/{id}`: campaign-DM-only notebook.

Every nested read requires current campaign membership and its appropriate ownership/role. Rules deny unauthenticated, unverified, and non-Google users. Campaign creation and invitation acceptance are atomic, role escalation is restricted, and only the admin can change DM assignments (including email-bound DM invitation acceptance). Campaign creators remain members, but do not need a DM assignment. Unknown paths, unknown fields, invalid types, oversized text/arrays/maps, stale revisions, forged owners and false summaries are rejected. Character and note saves use optimistic concurrency checks.

Wallet and currency IDs use a bounded slash-separated index string (IDs contain only letters, digits, `_` and `-`). Individual balances and rates live in separately validated documents. This avoids evaluating every wallet inside a single large sheet rule; the index is not a permission grant. Currently the editor supports 20 currencies/wallets and 50 members per campaign.

`lib/platform-admin.json` is the single admin-identity source shared by the UI and rules generator; no client-editable profile grants admin access. Rules require the matching verified Google identity.

`firestore.rules` is generated by `python3 scripts/generate-rules.py`; rerun rule tests after changing the generator. Standard SDK queries and `onSnapshot` are an intentional Enterprise exception because live party synchronization is required. The emulator tests exercise allowed queries and hostile writes; they use only a disposable local demo project.

Security Rules are a prototype and should be reviewed before broadly sharing the app. Production dependencies can be audited with `npm audit --omit=dev`; Firebase CLI is development/deployment tooling and can have separate upstream advisories.

Party files accept PDF and PNG/JPEG/WebP maps up to 8 MiB. Files are written atomically as a manifest plus immutable 256 KiB Firestore byte chunks (at most 32); lists subscribe to manifests only, so opening Party does not download attachments. Fetching bytes requires current campaign membership. Downloads validate chunk lengths, MIME signatures and SHA-256. PDF previews render with PDF.js into canvas without interactive annotations or executing embedded scripts. Authors and assigned DMs/admin can archive and restore files; archive is reversible and there is no client hard-delete. Files are separate from JSON campaign backups: download attachments individually. This small-group implementation uses the existing named database without adding Storage/billing dependencies; a larger library should move to authenticated object storage behind a backend that checks the named campaign database. Firestore read/write/storage usage still applies.

Invited players without a character see “Import your character with AI” on My characters. Everyone can reopen it, copy/download a neutral new-character prompt, provide their PDF/images to their own AI, review the generated JSON, and use Add character → Import JSON backup / Paste JSON backup. The prompt contains a neutral schema template, source interpretation rules, current campaign and account instructions. It imports a general sheet with the new character’s own class/species/edition, features and spell definitions. It does not grant login access. General sheets support editable stats, proficiency, private notes, portraits, wallets and a spell library with ready spells that consume confirmed slots. Class-specific limits, recharge rules and level-up choices require DM review. Separate 2014 Tempest cleric/legacy Goliath and Eberron Changeling bard (Lore/Valor) automation modes remain available for old backups; these are engines, not a limit on character count. Source PDFs shared in Party are not automatically converted or made into owned sheets.

DMs/admin can import a character for an unjoined invited player by choosing the invitation email as Owner. The sheet stays with the importer and shows “Awaiting sign-in” until the verified invited Google account joins and opens the campaign. The claim transaction changes only ownership/revision/audit fields and the matching public summary; private notes remain protected. Other players cannot set a pending recipient, claim another account’s sheet, or alter core data in the claim. A failed claim retries when the campaign is reopened.


## Party combat and session planning

DMs/admin can use **Rename campaign** in the campaign header, or edit Campaign name in their console. The shortcut updates only the name and audit timestamp.

Party contains a shared initiative table. **Add party** imports character names; **Add combatant** adds creatures or other participants. Enter initiative rolls and optional conditions, then **Save initiative**. The highest roll starts; smaller tie order resolves equal rolls. **Start combat / Next turn** highlights the active combatant and advances rounds. **Reset round** starts again at round1. Up to40 combatants are supported. Players see the live table; only campaign DMs/admin edit it. Saves use optimistic revisions, save automatically when leaving Party within the app, and warn before browser reload with unsaved edits.

**Party → Schedule session** lets a DM enter title, start/end, IANA time zone (Israel by default), location/link, notes, and optionally include invited players who have not joined. All joined members are included; review the deduplicated recipients before **Send Calendar invitations**. Missing verified member addresses block sending instead of silently omitting someone. Members register their verified Google address when opening the campaign. Admin can backfill historical addresses only from a member's original bound invitation.

The DM grants `calendar.events.owned` through Firebase Google reauthentication. The event is created on that same Google account's primary calendar with `sendUpdates=all`, so Google emails guests and handles RSVP. Access tokens are kept only in function memory. A private immutable draft is saved before contacting Calendar, and a stable Google event ID recovers interrupted sends without duplicate events. Use **Resume invitation** after a failed/uncertain send. Session listings become visible to players only after the Calendar response and Firestore save succeed. Later meeting edits, cancellations, and RSVP are managed in Google Calendar; Stormkeep lists the original invitation rather than polling calendars.

Additional campaign paths:

- `contacts/{uid}`: verified member addresses, readable by assigned DMs/admin (members can get their own). They are separate from public member profiles.
- `combat/current` and `combat/current/entries/{id}`: bounded combat state and entries, with atomic revisions.
- `sessionDrafts/{eventId}`: DM-only recipients and pending send details, immutable once sending begins.
- `sessions/{eventId}`: public meeting metadata and Calendar link, excluding the recipient email list.

For a new project, enable the Google Calendar API (`calendar-json.googleapis.com`) and configure Google OAuth audience/branding alongside Firebase Google sign-in. Stormkeep's existing project has Calendar enabled and an external production audience. The newly requested Calendar scope is sensitive; Google's unverified-app consent screen and100-user lifetime cap may apply until OAuth verification is completed. Wider public rollout needs Google's OAuth verification. No credentials are checked into Git. Local preview simulates a send with an explicit **no email sent** notice; automated Calendar tests use a mocked endpoint and never email real party members.
