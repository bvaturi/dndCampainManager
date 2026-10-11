# Stormkeep · D&D Campaign Manager

A campaign app with player-owned character sheets, a shared Party journal, and a DM console. One account can belong to multiple campaigns and have a different role in each.

## Current status

The interface and character-sheet integration are built and tested locally. **Firebase is not connected or deployed yet.** The requested account, `barakv01@gmail.com`, must complete Google sign-in, and the owner must choose an existing Firebase project or request a new one before Firebase configuration begins.

The production build deliberately shows a setup screen instead of offering a simulated login. Local preview data is fictional, exists only in memory, resets on refresh, and is compiled out of production. Preview role changes do not establish production access control.

## Local review

Requires Node.js 22.13 or later (CI uses Node.js 24).

```sh
npm ci
npm run preview:local -- --port 5174
```

Open `http://127.0.0.1:5174/`. The preview banner switches between DM and player views. The first campaign has one DM and two players; the same people have different roles in the second campaign.

```sh
npm test
npm run build
npm run dev
```

`npm run dev` uses the production setup screen until Firebase is connected. GitHub Actions checks tests and builds, and uploads a build artifact. It does not deploy an unfinished backend.

## Interface

- Campaign lobby: create campaigns, switch between campaigns, accept an invitation.
- My characters: edit owned sheets, save manually or automatically, export JSON backups, cast selected spells, track resources and coins, and level up without an application approval step.
- Party: character summaries, shared notes, quests, session records, and loot notes.
- DM console: all sheets, character assignment, player invitations, multiple DMs, a private DM notebook, campaign settings, campaign currency definitions, and JSON campaign export.
- Hebrew and English with RTL layout, searchable bilingual spells, smart change, additive coin deposits, and default currency selection.

Character automation initially supports the two existing sheet types: 2014 Tempest cleric with legacy Goliath traits, and 2014 bard with Eberron Changeling traits. Other classes and rule editions are future work. Application approval is not required for leveling; the character tools still explain normal tabletop rules and DM-dependent feat choices.

## Existing characters

Saved characters and player account data are not committed to this public repository. Generic starting templates are included. Export the latest JSON backup from the existing site, then use **Add character → Import JSON backup** with the matching character tools and owner after Firebase is connected. Import validation preserves levels, spell selections, resources, and wallet balances. The old site remains unchanged.

## Backend contract

`lib/gateway.ts` defines the operations required from the production adapter. `lib/backend.ts` currently returns no backend in production, or the explicit development fixture in preview mode. `app/sheet.tsx` uses an injected store with revision checks rather than the old Sites-specific API.

The intended Firebase implementation uses Google Authentication, Cloud Firestore, and classic Firebase Hosting for this React SPA. Determine the selected database's edition and location before adding its SDK integration. Secrets and deployment credentials must stay outside source control.

The production adapter and rules must enforce these permissions, regardless of the interface:

| Resource | Player | Campaign DM |
| --- | --- | --- |
| Campaign membership and roles | Accept a valid invitation for their verified Google email | Invite, revoke, assign roles |
| Full character sheets | Read and edit their own | Read and edit all campaign sheets |
| Character ownership | Cannot change | Assign to a campaign member |
| Party summaries | Read | Read |
| Party notes | Read all; create and edit their own | Read and edit all |
| Private DM notebook | No access | Read and edit |
| Campaign currencies and settings | Read | Edit |

Character writes and the corresponding Party summary must commit atomically, with optimistic revision checks. Private notes and full sheets must never be included in the Party summary payload. Removal from a campaign must revoke data access; the campaign creator remains a DM to prevent an ownerless campaign. Invite acceptance must not allow self-promotion to DM.

Before production deployment, implement the real adapter, database rules, indexes, and Google sign-in configuration; run emulator access tests for multiple users and campaigns, revoked members, forged ownership, and forged roles. Then enable Firebase hosting/deployment and use the project's HTTPS `web.app` address. Connecting a purchased custom domain can follow once a domain is chosen.

## Validation completed

Production build and ten automated checks: import integrity, invalid character and wallet data, purchase change, additive deposits, restricted Party summary shape, and 2014 level-three spell limits. Browser checks cover DM/player navigation, shared note creation, manual sheet saves updating Party HP summaries, and Hebrew layout. These are interface and data checks; production authentication and database-rule tests remain pending.
