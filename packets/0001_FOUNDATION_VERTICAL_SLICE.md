# Packet 0001 — Foundation Vertical Slice

## Objective

Create the first end-to-end usable Life365 build in the empty `simgenlogic/Life365` repository.

This packet must prove the complete product loop:

```text
Import Plan Packet
→ render persistent active items and recording opportunities
→ capture an outcome with minimal interaction
→ recover a missed recording opportunity later
→ compile a Context Packet
→ export and restore the complete local state
```

The result must deploy to GitHub Pages and be usable on an Android phone.

## Why this packet is deliberately broad

Continuity, missed-record recovery, low-friction input, and context export are not later enhancements. They are the core claim of the product. A smaller task tracker or packet viewer would not validate Life365.

## Technical baseline

Use:

- React + TypeScript + Vite;
- IndexedDB through Dexie or an equivalently thin typed wrapper;
- runtime validation of imported JSON against the supplied schema;
- a service worker and web app manifest suitable for installable PWA use;
- GitHub Actions deployment to GitHub Pages;
- repository base path `/Life365/`.

Do not add a backend.

## Permanent application shell

Implement a fixed mobile-first shell with these routes or bottom-navigation destinations:

1. Dashboard
2. Catch Up
3. Ledger
4. Packets
5. Generate
6. Data

The shell is stable. Packet data controls the content, not the navigation model.

## Required domain behavior

### 1. Packet import

Support both:

- selecting a local JSON file;
- pasting JSON text.

Before installation:

- parse the JSON;
- validate the complete packet;
- show a human-readable preview of item, prompt, and output-recipe additions or updates;
- reject invalid packets without changing IndexedDB.

Store the original packet JSON and installation timestamp.

### 2. Explicit-change semantics

Implement packet operations as upserts and explicit retirements.

Required invariant:

> Installing a packet that omits an existing item, prompt, or output recipe must leave the omitted object unchanged.

Revisions from different scopes must coexist. A later revision in one scope must not erase state from another scope.

### 3. Dashboard

Render three fixed sections.

#### Carry Forward

Show every active item whose packet configuration makes it visible and carried forward.

Each card shows:

- label;
- summary;
- time or days since its most recent linked record, or `No records yet`;
- a quick-capture action.

Do not use judgmental labels such as neglected, failed, behind, or overdue.

#### Available Now

Show prompt opportunities currently available.

For a single-choice prompt, render large tap targets. Selecting the primary value must store it immediately before any optional follow-up appears.

#### Catch Up summary

Show the number of unresolved past opportunities still inside their recovery window and link to Catch Up.

### 4. Opportunity generation

Generate scheduled opportunities whenever the app opens or resumes. Do not depend on background execution.

For Packet 0001, support:

- manual prompts;
- once prompts;
- daily prompts;
- days-of-week prompts.

Generation must be idempotent. Reopening the app must not duplicate opportunities.

Required states:

- available;
- deferred;
- answered;
- unknown;
- not_applicable;
- declined;
- expired_unrecorded.

An unanswered opportunity must never create a negative execution record.

### 5. Low-friction record capture

Support the field types already present in the supplied schema, but the visual priority is:

- single choice;
- integer/decimal;
- scale;
- short text;
- long text.

Rules:

- primary response saved in one tap;
- optional follow-ups cannot block primary save;
- `Later` defers without recording an outcome;
- Quick Capture can save a note with optional item linkage;
- occurrence date and recording timestamp remain separate;
- live and backfilled capture remain distinguishable;
- exact, approximate, and unknown precision remain distinguishable.

### 6. Catch Up

Past unanswered opportunities remain available until their configured recovery deadline.

The Catch Up flow must allow:

- entering the remembered answer;
- marking the answer approximate;
- marking unknown;
- marking not applicable;
- declining to record;
- leaving it unresolved.

After the recovery deadline, mark the opportunity `expired_unrecorded` and remove it from the active queue. Preserve it as an evidence gap.

### 7. Ledger

Show records and unresolved/expired opportunities chronologically.

Each record must expose:

- linked item and prompt when present;
- occurred date/time;
- recorded date/time;
- live, backfill, or free-capture mode;
- exact, approximate, or unknown precision;
- primary value and optional note.

Minimal filters:

- all;
- records;
- unresolved gaps;
- item.

### 8. Context generation

Install and render packet-defined output recipes using the fixed section types in the supplied schema.

Generate both:

- structured JSON;
- copy-ready Markdown.

The Markdown compiler must be deterministic and include, when requested by the recipe:

- all active items, including quiet ones;
- recent records;
- active items without recent linked records;
- unresolved and expired-unrecorded opportunities;
- evidence-coverage counts;
- a free-text planning request entered by the user.

The generated output must explicitly state that absence of a record is not evidence that the underlying action did not occur.

Store every generated Context Packet locally with its exact JSON and Markdown.

### 9. Data portability

Export one complete versioned JSON savefile containing:

- packet history;
- active items;
- prompt definitions;
- opportunities;
- records;
- output recipes;
- generated contexts;
- app metadata required for restoration.

Import flow must:

- validate before replacement;
- show record counts;
- require explicit confirmation;
- restore the complete state exactly.

### 10. PWA and GitHub Pages

- Production build succeeds.
- GitHub Actions deploys `main` to GitHub Pages.
- App assets work under `/Life365/`.
- Manifest uses correct start URL and scope.
- After one online load, the app shell opens offline.
- No user ledger data is added to the service-worker cache or repository.

## Seed-data behavior

Use `examples/seed-plan-packet.v0.1.json` only as a development and manual-test fixture.

Do not hard-code its project, movement, or food labels into app logic. A different valid packet must render without code changes.

## Required automated tests

At minimum, cover:

1. valid packet accepted;
2. invalid packet rejected atomically;
3. omission does not remove an existing object;
4. explicit retirement removes it from active rendering while preserving history;
5. two scopes coexist;
6. stale revision is rejected or handled without overwriting a newer revision;
7. opportunity generation is idempotent;
8. missed opportunity becomes Catch Up, not a negative record;
9. expired opportunity remains an evidence gap;
10. primary response is preserved independently of follow-up completion;
11. occurred time and recorded time remain distinct;
12. context output includes active quiet items;
13. context output labels recording gaps neutrally;
14. savefile export/import round-trips the full state.

## Manual acceptance scenario

Use this exact scenario before completion:

1. Open the deployed GitHub Pages app on Android.
2. Import the seed Plan Packet.
3. Confirm three Carry Forward items appear.
4. Record one current prompt using a single tap.
5. Leave another scheduled prompt unanswered.
6. Change the test/device date or use a deterministic test clock to advance one day.
7. Reopen the app and confirm the unanswered opportunity appears in Catch Up.
8. Backfill it approximately.
9. Generate the Daily Planning Context.
10. Confirm the output contains all active items, the live record, the backfilled record, and any remaining gap.
11. Import a new revision that updates only one item.
12. Confirm the other active items remain unchanged.
13. Export the savefile.
14. Reset local data.
15. Restore the savefile and confirm the dashboard, ledger, packet history, and generated context return.
16. Reload offline and confirm the shell and local state remain usable.

## Visual standard

The first release should be plain but deliberate:

- mobile-first layout;
- large tap targets;
- clear neutral status language;
- no dense forms on the Dashboard;
- no charts, scoring, streaks, celebratory effects, or recommendation banners;
- no desktop-only interaction dependency.

## Out of scope

- embedded LLM;
- notifications;
- cloud sync;
- accounts;
- calendar or wearable integrations;
- arbitrary packet-authored layouts;
- arbitrary formulas or executable packet code;
- plan-specific modules;
- analytics dashboards;
- automatic planning conclusions.

## Completion definition

Packet 0001 is complete only when the full manual acceptance scenario works on the deployed GitHub Pages build and the automated test suite passes.
