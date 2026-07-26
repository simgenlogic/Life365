# LIFE365 v0.1 — Implementation Specification

## 1. Product definition

LIFE365 is a local-first planning continuity PWA. It imports structured **Plan Packets** produced by an external coaching chat, turns them into low-friction recording surfaces, preserves execution evidence and missing-data gaps, and generates **Context Packets** for the next planning conversation.

The application does not interpret the plan, choose priorities, or recommend actions. It provides durable state and deterministic packet handling.

## 2. Core loop

1. Import a Plan Packet.
2. Apply explicit packet changes to the active state.
3. Render active items and packet-defined prompts in a fixed mobile dashboard shell.
4. Record immediate, delayed, approximate, unknown, or not-applicable responses.
5. Preserve active items even when they receive no recent input.
6. Compile a Context Packet from the active state, ledger, unresolved opportunities, and user request.
7. Copy the Context Packet into the coaching chat.
8. Import the resulting Plan Packet without deleting unrelated active state.

## 3. Non-negotiable semantics

### 3.1 Omission never means removal

A new Plan Packet may update only the part of the plan currently being discussed. An existing item or prompt remains active unless a packet explicitly updates, pauses, or retires it.

### 3.2 Missing input never means failure

The application must distinguish:

- recorded completion or outcome;
- no recording yet;
- delayed/backfilled recording;
- unknown historical outcome;
- not applicable;
- deliberately declined input;
- expired recording opportunity with no answer.

### 3.3 Capture the event before enrichment

A primary outcome should usually be recordable in one or two taps. Optional detail appears only after the primary value is safely stored.

### 3.4 The app reports state; the chat interprets it

The app may report that an active item has no linked records for six days. It may not label the item neglected, failing, or lower priority.

### 3.5 Packets contain data, not executable code

Plan Packets may use only the supported fields, prompt types, schedules, selectors, and output recipes. No JavaScript, HTML, expressions, or arbitrary template code is executed.

## 4. Stable application shell

The application has six permanent screens. Packet content changes; navigation does not.

### 4.1 Dashboard

Fixed sections:

1. **Carry Forward** — all active packet items configured for dashboard visibility, including last linked record age.
2. **Available Now** — prompt opportunities currently within their preferred window.
3. **Catch Up** — unanswered opportunities still inside their recovery window.
4. **Quick Capture** — add a free note or a record linked to any active item.
5. **Generate Context** — direct access to available output recipes.

Suggested mobile layout:

```text
┌──────────────────────────────────┐
│ LIFE365       Sun Jul 26   Export│
├──────────────────────────────────┤
│ CARRY FORWARD                    │
│ Primary project       today   [+]│
│ Movement plan         3 days  [+]│
│ Food system           6 days  [+]│
├──────────────────────────────────┤
│ AVAILABLE NOW                    │
│ What happened with the session? │
│ [Done] [Partial] [No] [Later]   │
├──────────────────────────────────┤
│ CATCH UP                         │
│ 2 recording opportunities       │
│ [Review]                         │
├──────────────────────────────────┤
│ [+ Quick note]                   │
└──────────────────────────────────┘
```

No charts, scores, streaks, or recommendation banners are required in v0.1.

### 4.2 Catch Up

Shows unanswered opportunities by occurrence date. Language must remain neutral.

Example:

```text
Saturday, July 25
Session result
[Completed] [Partial] [Did not happen] [Unknown]
```

The user may:

- answer approximately;
- mark unknown;
- mark not applicable;
- defer again while the recovery window remains open;
- leave the opportunity unresolved.

### 4.3 Ledger

Chronological records with filters for:

- item;
- prompt;
- packet scope;
- occurrence date;
- recording date;
- live versus backfilled capture;
- precision;
- unresolved opportunities.

### 4.4 Packets

Displays:

- installed packet revisions;
- scope;
- installation date;
- supersession chain;
- validation status;
- human-readable change summary;
- raw JSON download.

Import flow:

1. Select or paste JSON.
2. Validate against the Plan Packet schema.
3. Preview additions, updates, pauses, and retirements.
4. Install.
5. Preserve previous packet and ledger history.

### 4.5 Generate

The user chooses an output recipe, adds an optional planning request, previews the compiled Markdown, and copies or downloads it.

The generator also stores the exact JSON and Markdown output in the ledger for traceability.

### 4.6 Data

- Export complete savefile.
- Import and validate savefile.
- Display database schema version.
- Confirm record counts before replacement.
- Support future schema migrations.

## 5. Plan Packet contract

### 5.1 Envelope

```json
{
  "schema": "life365.plan/v0.1",
  "packet_id": "uuid-or-stable-string",
  "scope_id": "stable-scope-name",
  "revision": 1,
  "created_at": "2026-07-26T14:00:00-04:00",
  "title": "Human-readable packet title",
  "summary": "What this packet changes",
  "changes": {
    "items": {
      "upsert": [],
      "retire": []
    },
    "prompts": {
      "upsert": [],
      "retire": []
    },
    "output_recipes": {
      "upsert": [],
      "retire": []
    }
  }
}
```

### 5.2 Scope and revision rules

- `scope_id` identifies a continuing stream of plan updates.
- Revisions must increase within a scope.
- Installing a newer revision supersedes the previous revision for that scope.
- Supersession does not remove items or prompts by omission.
- Explicit `retire` operations are required.
- Different scopes coexist.

### 5.3 Generic item

```json
{
  "item_id": "stable-item-id",
  "label": "Visible label",
  "state": "active",
  "summary": "Current plan wording",
  "tags": ["optional", "free-form"],
  "dashboard": {
    "visible": true,
    "order": 20,
    "show_last_record_age": true
  },
  "continuity": {
    "carry_forward": true,
    "quiet_after_days": 4
  }
}
```

Supported item states in v0.1:

- `active`
- `paused`
- `closed`

These states are set by imported packets or explicit user action. The app does not select them.

### 5.4 Prompt definition

```json
{
  "prompt_id": "stable-prompt-id",
  "item_id": "optional-linked-item-id",
  "label": "Question shown to the user",
  "help_text": "Optional short clarification",
  "field": {
    "type": "single_choice",
    "options": [
      {"value": "done", "label": "Done"},
      {"value": "partial", "label": "Partial"},
      {"value": "not_done", "label": "Did not happen"}
    ]
  },
  "availability": {
    "type": "daily",
    "local_time": "13:00",
    "start_date": "2026-07-27",
    "end_date": null
  },
  "capture": {
    "tier": 1,
    "allow_backfill": true,
    "recovery_days": 3,
    "allow_unknown": true,
    "allow_not_applicable": true,
    "allow_defer": true
  },
  "followups": []
}
```

Supported field types in v0.1:

- `single_choice`
- `multi_choice`
- `boolean`
- `integer`
- `decimal`
- `scale`
- `short_text`
- `long_text`
- `duration_minutes`
- `time`
- `date`

Supported availability types in v0.1:

- `manual`
- `once`
- `daily`
- `days_of_week`

Full recurrence rules are deliberately deferred.

### 5.5 Follow-up definition

Follow-ups use restricted equality conditions only.

```json
{
  "when": {
    "field": "primary",
    "equals": "partial"
  },
  "field": {
    "id": "amount",
    "label": "Approximate amount completed",
    "type": "integer",
    "optional": true
  }
}
```

The primary record is saved before follow-ups open.

### 5.6 Output recipe

```json
{
  "recipe_id": "daily-planning-context",
  "title": "Daily Planning Context",
  "sections": [
    {"type": "active_items"},
    {"type": "recent_records", "days": 7},
    {"type": "quiet_items"},
    {"type": "unresolved_opportunities", "days": 7},
    {"type": "evidence_coverage", "days": 7},
    {"type": "user_request"}
  ]
}
```

Supported section types are fixed by the application. A packet selects and configures them but cannot execute an arbitrary query or template.

## 6. Context Packet contract

The app produces both structured JSON and copy-ready Markdown.

### 6.1 Structured envelope

```json
{
  "schema": "life365.context/v0.1",
  "context_id": "generated-uuid",
  "generated_at": "2026-07-26T14:30:00-04:00",
  "recipe_id": "daily-planning-context",
  "active_items": [],
  "recent_records": [],
  "quiet_items": [],
  "unresolved_opportunities": [],
  "evidence_coverage": {},
  "user_request": "Plan tomorrow using the current state."
}
```

### 6.2 Markdown order

1. Packet metadata.
2. Current active items.
3. Recent execution evidence.
4. Active items without recent records.
5. Unresolved or expired recording opportunities.
6. Evidence coverage and precision.
7. User's planning request.

The compiler must state that absence of a record is not evidence that the underlying action did not occur.

## 7. Persistent data model

Recommended IndexedDB tables:

### `packets`

- `packetId`
- `scopeId`
- `revision`
- `schema`
- `title`
- `summary`
- `installedAt`
- `status` (`active`, `superseded`, `rejected`)
- `rawJson`

### `items`

- `itemId`
- `scopeId`
- `sourcePacketId`
- `label`
- `state`
- `summary`
- `tags`
- `dashboardConfig`
- `continuityConfig`
- `updatedAt`

### `prompts`

- `promptId`
- `scopeId`
- `sourcePacketId`
- `itemId`
- `definition`
- `state`
- `updatedAt`

### `opportunities`

- `opportunityId`
- `promptId`
- `itemId`
- `scheduledForLocalDate`
- `preferredWindowStart`
- `preferredWindowEnd`
- `recoveryUntil`
- `state`
- `createdAt`
- `closedAt`

Supported opportunity states:

- `available`
- `deferred`
- `answered`
- `unknown`
- `not_applicable`
- `declined`
- `expired_unrecorded`

### `records`

- `recordId`
- `opportunityId` (nullable)
- `promptId` (nullable)
- `itemId` (nullable)
- `scopeId` (nullable)
- `valueJson`
- `occurredAt`
- `occurredLocalDate`
- `recordedAt`
- `captureMode` (`live`, `backfill`, `free_capture`)
- `precision` (`exact`, `approximate`, `unknown`)
- `note`
- `sourcePacketId`

### `generated_contexts`

- `contextId`
- `recipeId`
- `generatedAt`
- `json`
- `markdown`

### `app_meta`

- database schema version;
- last opportunity-generation date;
- device timezone;
- installation identifier.

## 8. Opportunity and catch-up engine

A PWA should not depend on a background process to create prompts. Opportunity generation runs whenever the app opens or resumes.

Algorithm:

1. Read `lastOpportunityGenerationDate`.
2. Enumerate active prompt definitions.
3. Determine every scheduled local date between the last generation date and today.
4. Create missing opportunity instances idempotently.
5. Mark current-window opportunities `available`.
6. Keep unanswered past opportunities in Catch Up until `recoveryUntil`.
7. After the recovery window, mark them `expired_unrecorded`.
8. Do not create a negative outcome record.

Older expired gaps remain visible to context recipes but do not create an infinite catch-up queue.

## 9. Low-friction capture rules

- Primary choices use large one-tap buttons.
- Save immediately after the primary selection.
- Follow-ups are optional unless the packet explicitly marks one required.
- `Later` changes the opportunity to `deferred`; it does not create an outcome record.
- Backfill defaults the occurrence date to the opportunity date and records the actual entry timestamp separately.
- Approximate values are explicitly marked.
- Quick Capture requires only a note; item linking is optional.
- No daily form must be completed before the app can be closed.

## 10. Technology recommendation

- React + TypeScript + Vite.
- IndexedDB through Dexie.
- Runtime packet validation through Zod or JSON Schema validation.
- Pure domain functions for packet installation, opportunity generation, record creation, and context compilation.
- Static PWA deployment; no server, account, cloud sync, or AI API.
- Service worker caches the application shell and assets only.
- Mobile-first responsive design for Android.
- Complete JSON savefile export with schema versioning.

Suggested source layout:

```text
src/
  domain/
    planPacket.ts
    packetInstaller.ts
    opportunityEngine.ts
    recordService.ts
    contextCompiler.ts
  db/
    database.ts
    migrations.ts
  screens/
    DashboardScreen.tsx
    CatchUpScreen.tsx
    LedgerScreen.tsx
    PacketsScreen.tsx
    GenerateScreen.tsx
    DataScreen.tsx
  components/
    ActiveItemCard.tsx
    PromptCard.tsx
    QuickCapture.tsx
    ContextPreview.tsx
  schemas/
    plan-packet-v0.1.schema.json
```

## 11. Implementation sequence

### Packet 0001 — Closed-loop vertical slice

Build:

- PWA shell and local database;
- Plan Packet import and validation;
- explicit item/prompt upsert and retirement;
- Dashboard Carry Forward and Available Now sections;
- one-tap prompt recording;
- Ledger;
- one fixed daily-planning Context recipe;
- Markdown copy;
- complete savefile export/import.

The first slice may support only `manual`, `once`, and `daily` prompts and only `single_choice`, `integer`, `scale`, and text fields.

### Packet 0002 — Missed opportunity recovery

Build:

- opportunity generation on app open;
- preferred windows;
- deferred state;
- Catch Up screen;
- backfilled occurrence time;
- approximate/unknown/not-applicable states;
- expired-unrecorded gaps;
- evidence coverage in Context Packets.

### Packet 0003 — Continuity across plan revisions

Build:

- multiple scopes;
- revision ordering;
- packet preview;
- explicit pause/close/retire changes;
- last-linked-record age;
- quiet-item section;
- confirmation that omission never removes state.

### Packet 0004 — PWA hardening

Build:

- installable manifest;
- offline asset caching;
- responsive polish;
- keyboard and screen-reader support;
- database migrations;
- corrupted import handling;
- deployment to GitHub Pages.

## 12. v0.1 acceptance tests

The first usable release is accepted only when all of the following are true:

1. A valid Plan Packet can be imported from a local JSON file or pasted text.
2. Invalid packets are rejected before any database changes occur.
3. Importing a packet changes dashboard content without changing application code.
4. An existing active item remains visible when a later packet does not mention it.
5. An item disappears from Carry Forward only after an explicit pause, close, or retirement.
6. A prompt can be answered in no more than two taps when no optional detail is entered.
7. Closing the app after a primary answer does not lose the record.
8. An unanswered scheduled prompt becomes a Catch Up opportunity rather than a failure record.
9. A backfilled record stores occurrence time and recording time separately.
10. The user can mark a historical result approximate, unknown, or not applicable.
11. A generated Context Packet includes all active items, not only recently discussed ones.
12. The Context Packet identifies unresolved and expired-unrecorded gaps neutrally.
13. Full savefile export followed by import reproduces packets, active state, opportunities, records, and generated contexts.
14. The application works offline after the first successful load.

## 13. Explicitly out of scope for v0.1

- embedded LLM or external AI API;
- app-generated recommendations;
- automatic priority selection;
- natural-language interpretation;
- notification system;
- calendar integration;
- cloud accounts or sync;
- wearable integrations;
- social features;
- gamification, streak pressure, or scores;
- arbitrary packet-authored UI layouts;
- arbitrary code or formula execution;
- complex recurrence grammar;
- domain-specific fitness, nutrition, sleep, project, or chess modules.

## 14. First build objective

The first implementation should prove one complete, real interaction:

```text
Import Plan Packet
→ see three persistent active items
→ answer one prompt in one tap
→ leave another unanswered
→ reopen the app the next day
→ recover the missed entry through Catch Up
→ generate a Context Packet containing the active plan, both records, and the recording gap
→ import a revised packet that changes one item without erasing the other two
```

If this loop works cleanly, the application has proven its central value before any broader feature work begins.
