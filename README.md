# Life365

Life365 is a local-first planning-continuity PWA. It bridges planning and execution without embedding an LLM.

The app:

- imports structured Plan Packets created in an external coaching conversation;
- turns those packets into a live dashboard and low-friction recording opportunities;
- preserves active plan items when attention shifts elsewhere;
- distinguishes missing input from non-completion;
- supports immediate, delayed, approximate, unknown, and not-applicable recording;
- compiles structured Context Packets for the next planning conversation;
- stores all personal state locally and supports complete savefile export and restore.

The app does **not** choose priorities, interpret results, recommend actions, or encode the current Life365 plan into its application logic.

## Deployment target

Static PWA hosted through GitHub Pages:

`https://simgenlogic.github.io/Life365/`

GitHub hosts the application shell. IndexedDB stores user data locally in the browser. No server, account system, cloud database, or AI API is required for the initial product.

## Product contract

Read these before implementation:

- [`PROJECT_SPEC.md`](PROJECT_SPEC.md)
- [`packets/0001_FOUNDATION_VERTICAL_SLICE.md`](packets/0001_FOUNDATION_VERTICAL_SLICE.md)
- [`schemas/life365-plan-packet-v0.1.schema.json`](schemas/life365-plan-packet-v0.1.schema.json)
- [`examples/seed-plan-packet.v0.1.json`](examples/seed-plan-packet.v0.1.json)

## Core invariants

1. Omission never means removal.
2. Missing input never means failure.
3. Capture the primary fact before optional detail.
4. The app reports state; the coaching chat interprets it.
5. The plan may change without requiring changes to the application vehicle.
6. All data must remain exportable and restorable.

## Status

Repository initialized for Packet 0001: Foundation Vertical Slice.
