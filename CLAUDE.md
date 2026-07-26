# Life365 — Implementation Rules

## Roles

- User: project lead and final acceptance authority.
- GPT: design lead and system architect.
- Claude Code: implementation translation, coding, testing, and completion reporting.

## Read first

Before changing code, read:

1. `PROJECT_SPEC.md`
2. the active packet under `packets/`
3. the Plan Packet schema and example

The active packet is the immediate implementation contract. `PROJECT_SPEC.md` provides the product invariants and longer-term architecture.

## Product boundaries

Life365 is a stable packet runtime and continuity ledger. It is not a hard-coded representation of the current coaching plan.

Do not add:

- embedded AI or AI-like recommendations;
- domain-specific fitness, sleep, nutrition, chess, project, or health modules;
- automatic priority selection;
- negative assumptions from missing records;
- arbitrary packet-supplied JavaScript, HTML, or executable expressions;
- cloud accounts or mandatory network storage;
- gamification, scores, streak penalties, or motivational copy.

## Implementation discipline

- Mobile-first Android use is the primary interface target.
- GitHub Pages is the deployment target; use repository-relative asset paths for `/Life365/`.
- Keep domain logic separate from React components.
- Packet installation, opportunity generation, record creation, and context compilation must be deterministic pure functions where practical.
- Validate imports before mutating persistent state.
- Preserve packet revisions and raw imports for traceability.
- Preserve `occurredAt` separately from `recordedAt`.
- Never infer a negative result from an unanswered prompt.
- Do not silently remove state because a newer packet omits it.
- Use stable IDs and idempotent opportunity generation.
- Full savefile export/restore is a core feature, not an optional utility.

## Git workflow

For each implementation packet:

1. Start from current `main`.
2. Use a dedicated branch named `claude/packet-XXXX-description`.
3. Keep the packet scope frozen unless the user explicitly approves expansion.
4. Run tests and production build before reporting completion.
5. Push the branch and open a pull request when possible.
6. Do not merge without user approval.

## Completion report

Report:

- branch and commit;
- files created or changed;
- implemented behavior;
- tests and build results;
- GitHub Pages/deployment status;
- known limitations within the accepted packet boundary;
- exact steps for the user to test on Android;
- confirmation that no unrelated product logic was added.
