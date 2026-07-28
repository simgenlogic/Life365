# Packet 0001B — Persistent Packet Installation

## Objective

Add durable Plan Packet installation and Dashboard Carry Forward state to the deployed Life365 application.

Packet 0001A proved that the application shell can validate Plan Packets safely. Packet 0001B turns a validated packet into persistent local application state while preserving the core continuity rule:

> Omission never means removal.

This packet does **not** add opportunity scheduling, execution recording, Catch Up, Context Packet generation, offline service-worker support, or savefile restoration.

## Starting point

Start from the current merged `main` after Packet 0001A.

Read before implementation:

- `README.md`
- `PROJECT_SPEC.md`
- `CLAUDE.md`
- `packets/0001_FOUNDATION_VERTICAL_SLICE.md`
- `schemas/life365-plan-packet-v0.1.schema.json`
- `examples/seed-plan-packet.v0.1.json`

Create a dedicated branch:

```text
claude/packet-0001b-persistent-installation
```

Do not merge without user approval.

---

## 1. IndexedDB foundation

Add Dexie and a versioned local database.

Implement persistent tables for:

- `packets`
- `items`
- `prompts`
- `outputRecipes`
- `appMeta`

Store enough information to preserve:

### Packets

- packet id;
- scope id;
- revision;
- schema id;
- title;
- summary;
- created timestamp from the packet;
- installed timestamp;
- status: `active` or `superseded`;
- original validated packet JSON.

### Installed definitions

For items, prompts, and output recipes, preserve:

- stable definition id;
- owning scope id;
- current active/retired state;
- latest definition content;
- source packet id that most recently changed it;
- updated timestamp;
- retirement metadata where applicable.

Use composite identity where required so definitions from separate scopes cannot overwrite one another accidentally.

A prompt `item_id` refers to an item in the same packet scope.

Keep all database access outside React components.

---

## 2. Pure installation preflight

Create a deterministic preflight function that accepts:

- a validated Plan Packet;
- a snapshot of the relevant currently installed state.

It must return either:

- a complete proposed installation plan; or
- structured installation errors.

Preflight must not mutate IndexedDB or React state.

### Required preflight checks

Reject installation when any of the following is true:

1. The packet revision is older than the currently installed revision for the same scope.
2. A different packet reuses an existing `packet_id`.
3. An upsert list contains duplicate ids.
4. The same id appears in both `upsert` and `retire` for one object type.
5. A prompt references an item that will not exist as an available same-scope item after the proposed installation.
6. An explicit retirement target is malformed or creates an ambiguous operation.
7. Any operation cannot be applied deterministically.

### Exact re-import

Reimporting the exact same already-installed packet may be treated as an idempotent no-op.

It must not:

- create duplicate packet history;
- duplicate definitions;
- update timestamps unnecessarily;
- alter active state.

### Proposed change summary

The preflight result should classify proposed changes as:

- additions;
- updates;
- retirements;
- unchanged definitions;
- superseded packet revision;
- idempotent no-op.

---

## 3. Atomic installation

Apply an accepted installation plan in one IndexedDB transaction.

### Required semantics

1. **Omission never removes state.**
   - A newer packet that does not mention an existing item, prompt, or output recipe leaves it unchanged.

2. **Retirement must be explicit.**
   - A definition becomes retired only through an explicit `retire` operation.

3. **Scope revisions supersede packet revisions, not omitted definitions.**
   - Installing a newer revision marks the prior active packet revision in that scope as superseded.
   - Definitions omitted by the newer packet remain installed exactly as they were.

4. **Scopes coexist.**
   - Installing one scope must not modify another scope.

5. **Failure is atomic.**
   - A failed installation leaves all tables unchanged.

6. **History is durable.**
   - Superseded packets and retired definitions remain available for inspection.

7. **Source attribution remains accurate.**
   - A definition's source packet id identifies the most recent packet that explicitly added, updated, or retired it.

---

## 4. Packets screen

Extend the existing Packets screen after successful validation.

### Add

- `Install packet` action;
- installation preflight before mutation;
- proposed-change preview;
- installation errors distinct from JSON/schema-validation errors;
- explicit confirmation before applying a non-no-op installation;
- success result after installation;
- clear idempotent-no-op result;
- installed packet history.

### Installed packet history must show

- title;
- scope;
- revision;
- packet id;
- installation time;
- active or superseded status.

Do not allow installation before validation and preflight both succeed.

Do not introduce editing of installed packet contents in this milestone.

---

## 5. Dashboard Carry Forward

Replace the Dashboard placeholder with persistent Carry Forward cards sourced from IndexedDB.

Display items that meet all of these conditions:

- not retired;
- `state = active`;
- `dashboard.visible = true`;
- `continuity.carry_forward = true`.

### Ordering

Sort by:

1. `dashboard.order` ascending;
2. stable item identifier ascending as the deterministic tie-breaker.

### Card content

Each card shows:

- item label;
- item summary;
- tags when present and useful;
- `No records yet` as the record-age state, because record capture is not implemented in Packet 0001B.

### Neutral language

Do not add language implying:

- success;
- failure;
- neglect;
- urgency;
- recommendation;
- priority judgment;
- streak status.

Paused, closed, and retired items remain in stored history but do not appear under Carry Forward.

---

## 6. Database and domain boundaries

Keep these concerns separate:

- runtime packet validation;
- installation preflight;
- transaction application;
- database queries;
- Dashboard selection;
- React rendering.

React components must not directly encode packet installation rules.

Prefer deterministic pure functions for:

- duplicate detection;
- revision checks;
- proposed-state construction;
- prompt reference checks;
- change classification;
- Carry Forward filtering and ordering.

---

## 7. Required tests

Use an IndexedDB-compatible test environment such as `fake-indexeddb`.

At minimum, prove:

1. The seed packet installs successfully.
2. Installed state persists across database reopening.
3. Installing a later revision that omits an item leaves that item unchanged.
4. Explicit retirement removes an item from Carry Forward while preserving packet history.
5. Two scopes coexist without collision.
6. A stale revision is rejected without mutation.
7. Exact packet reimport is idempotent.
8. Reusing a packet id with different content is rejected.
9. Duplicate upsert ids are rejected.
10. An id appearing in both upsert and retire is rejected.
11. A prompt with an unavailable same-scope item reference is rejected.
12. A failed multi-object installation rolls back completely.
13. Installed packet history correctly marks prior same-scope revisions superseded.
14. The definition source packet changes only when that definition is explicitly changed.
15. Dashboard selection excludes paused, closed, retired, hidden, and non-carry-forward items.
16. Dashboard ordering is deterministic.
17. Validation remains separate from installation.
18. No installation path mutates state before confirmation.

---

## 8. Manual acceptance scenario

Before completion, verify this exact flow:

1. Open the deployed app with a clean local database.
2. Navigate to Packets.
3. Paste or select `examples/seed-plan-packet.v0.1.json`.
4. Validate it.
5. Review the proposed installation changes.
6. Install it.
7. Confirm packet history shows `core-plan` revision 1 as active.
8. Open Dashboard.
9. Confirm the three seed items appear under Carry Forward in deterministic order.
10. Reload the page.
11. Confirm the installed packet and Dashboard items remain.
12. Reimport the exact seed packet.
13. Confirm the app reports an idempotent no-op and creates no duplicate history.
14. Import a valid revision 2 that changes only one item and omits the other two.
15. Confirm revision 1 becomes superseded and revision 2 becomes active.
16. Confirm the omitted items remain unchanged and visible.
17. Import a valid explicit retirement for one item.
18. Confirm that item leaves Carry Forward while the packet and definition history remain inspectable.

---

## 9. Verification

Run:

```text
npm run typecheck
npm test
npm run build
```

Push the branch and open a draft pull request against `main`.

The pull-request CI build must pass. Pull requests must not deploy Pages.

Do not merge.

---

## 10. Explicitly out of scope

Do not implement:

- opportunity generation;
- schedule evaluation;
- recording opportunities;
- execution records;
- Quick Capture;
- Catch Up behavior;
- Context Packet compilation;
- savefile export or restore;
- service-worker offline caching;
- notifications;
- cloud sync;
- accounts;
- embedded AI;
- plan interpretation;
- plan-specific fitness, nutrition, sleep, project, or chess logic;
- arbitrary packet-authored code, formulas, or layouts.

---

## 11. Completion report

Report:

- branch and commit;
- draft PR;
- exact files created or changed;
- IndexedDB schema and version;
- installation preflight rules;
- transaction semantics;
- packet-history behavior;
- Dashboard Carry Forward behavior;
- test count and results;
- type-check and production-build results;
- exact manual Android testing steps;
- remaining Packet 0001 work;
- confirmation that no scheduling, recording, Catch Up, context generation, AI, or plan-specific logic was added.

## Completion definition

Packet 0001B is complete when a validated packet can be installed durably, revised without silent erasure, inspected through packet history, and rendered as persistent Carry Forward state on the Dashboard.
