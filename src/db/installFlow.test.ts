import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { validatePlanPacketJson } from '../domain/validatePlanPacket';
import type { PlanPacket } from '../domain/planPacket';
import type { InstallPlan } from '../domain/installTypes';
import { selectCarryForward } from '../domain/carryForward';
import { Life365Db } from './database';
import { applyInstallPlan, readScopeFingerprint } from './applyInstall';
import { commitInstall, prepareInstall } from './installFlow';

const seedPath = fileURLToPath(
  new URL('../../examples/seed-plan-packet.v0.1.json', import.meta.url),
);
const seedJson = readFileSync(seedPath, 'utf-8');

function seedPacket(): PlanPacket {
  const result = validatePlanPacketJson(seedJson);
  if (!result.ok) throw new Error('seed fixture should validate');
  return result.packet;
}

let counter = 0;
const openDbs: Life365Db[] = [];

function freshDb(): Life365Db {
  const db = new Life365Db(`test-${Date.now()}-${counter++}`);
  openDbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
});

/** Preflight + apply with a fixed timestamp; asserts the plan was accepted. */
async function install(
  db: Life365Db,
  packet: PlanPacket,
  now: string,
): Promise<InstallPlan> {
  const result = await prepareInstall(db, packet);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected preflight to succeed');
  await applyInstallPlan(db, result.plan, now);
  return result.plan;
}

describe('installation flow', () => {
  it('installs the seed packet successfully', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    expect(await db.packets.count()).toBe(1);
    expect(await db.items.count()).toBe(3);
    expect(await db.prompts.count()).toBe(2);
    expect(await db.outputRecipes.count()).toBe(1);

    const packet = await db.packets.get('seed-2026-07-26-r1');
    expect(packet?.status).toBe('active');
  });

  it('persists installed state across reopening the database', async () => {
    const dbName = `persist-${Date.now()}-${counter++}`;
    const db1 = new Life365Db(dbName);
    await install(db1, seedPacket(), '2026-07-28T10:00:00.000Z');
    db1.close();

    const db2 = new Life365Db(dbName);
    openDbs.push(db2);
    expect(await db2.packets.count()).toBe(1);
    expect(await db2.items.count()).toBe(3);
    const item = await db2.items.get(['core-plan', 'primary-project']);
    expect(item?.definition.label).toBe('Primary project');
  });

  it('leaves an omitted item unchanged when a later revision installs', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const revision2 = seedPacket();
    revision2.packet_id = 'seed-2026-07-26-r2';
    revision2.revision = 2;
    // Change only the first item; omit the other two and all prompts/recipes.
    revision2.changes.items.upsert = [
      {
        ...revision2.changes.items.upsert[0],
        summary: 'Revision 2 wording.',
      },
    ];
    revision2.changes.prompts.upsert = [];
    revision2.changes.output_recipes.upsert = [];
    await install(db, revision2, '2026-07-29T10:00:00.000Z');

    const changed = await db.items.get(['core-plan', 'primary-project']);
    expect(changed?.definition.summary).toBe('Revision 2 wording.');
    expect(changed?.sourcePacketId).toBe('seed-2026-07-26-r2');

    // The omitted item is byte-for-byte unchanged, still sourced to revision 1.
    const omitted = await db.items.get(['core-plan', 'movement-base']);
    expect(omitted?.sourcePacketId).toBe('seed-2026-07-26-r1');
    expect(omitted?.updatedAt).toBe('2026-07-28T10:00:00.000Z');
    expect(omitted?.retired).toBe(false);
  });

  it('removes an explicitly retired item from Carry Forward but keeps history', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const retire = seedPacket();
    retire.packet_id = 'seed-2026-07-26-r2';
    retire.revision = 2;
    retire.changes.items.upsert = [];
    retire.changes.prompts.upsert = [];
    retire.changes.output_recipes.upsert = [];
    retire.changes.items.retire = ['movement-base'];
    // The prompt referencing this item must be retired too, otherwise it would
    // be left referencing a retired item.
    retire.changes.prompts.retire = ['movement-result'];
    await install(db, retire, '2026-07-29T10:00:00.000Z');

    const stored = await db.items.get(['core-plan', 'movement-base']);
    expect(stored).toBeDefined();
    expect(stored?.retired).toBe(true);
    expect(stored?.retiredBySourcePacketId).toBe('seed-2026-07-26-r2');

    const cards = selectCarryForward(await db.items.toArray()).map(
      (i) => i.itemId,
    );
    expect(cards).not.toContain('movement-base');
    expect(cards).toContain('primary-project');

    // Packet history retains both revisions.
    expect(await db.packets.count()).toBe(2);
  });

  it('keeps two scopes independent', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const other = seedPacket();
    other.packet_id = 'other-scope-r1';
    other.scope_id = 'side-plan';
    other.changes.items.upsert = [other.changes.items.upsert[0]];
    other.changes.prompts.upsert = [];
    other.changes.output_recipes.upsert = [];
    await install(db, other, '2026-07-28T11:00:00.000Z');

    expect(await db.items.where('scopeId').equals('core-plan').count()).toBe(3);
    expect(await db.items.where('scopeId').equals('side-plan').count()).toBe(1);
    // Same item id exists independently in each scope.
    const core = await db.items.get(['core-plan', 'primary-project']);
    const side = await db.items.get(['side-plan', 'primary-project']);
    expect(core?.sourcePacketId).toBe('seed-2026-07-26-r1');
    expect(side?.sourcePacketId).toBe('other-scope-r1');
  });

  it('rejects a stale revision without mutating state', async () => {
    const db = freshDb();
    const rev2 = seedPacket();
    rev2.packet_id = 'seed-2026-07-26-r2';
    rev2.revision = 2;
    await install(db, rev2, '2026-07-28T10:00:00.000Z');

    const before = await snapshotCounts(db);
    const stale = seedPacket(); // revision 1
    const result = await prepareInstall(db, stale);
    expect(result.ok).toBe(false);

    expect(await snapshotCounts(db)).toEqual(before);
  });

  it('treats exact reimport as an idempotent no-op with no duplicate history', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');
    const item = await db.items.get(['core-plan', 'primary-project']);

    const result = await prepareInstall(db, seedPacket());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.noop).toBe(true);
    // Applying a no-op writes nothing.
    await applyInstallPlan(db, result.plan, '2026-07-30T10:00:00.000Z');

    expect(await db.packets.count()).toBe(1);
    expect(await db.items.count()).toBe(3);
    const after = await db.items.get(['core-plan', 'primary-project']);
    expect(after?.updatedAt).toBe(item?.updatedAt);
  });

  it('rejects reusing a packet id with different content', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const clash = seedPacket();
    clash.title = 'Different content, same id';
    const result = await prepareInstall(db, clash);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'packet_id_reused')).toBe(true);
  });

  it('rolls back a failed multi-object installation atomically', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');
    const before = await snapshotCounts(db);

    // Craft a plan with one valid add and one invalid retire (missing target).
    const badPlan: InstallPlan = {
      noop: false,
      scopeId: 'core-plan',
      packet: {
        packetId: 'bad-r2',
        scopeId: 'core-plan',
        revision: 2,
        schema: 'life365.plan/v0.1',
        title: 'Bad',
        summary: '',
        createdAt: '2026-07-29T00:00:00-04:00',
        rawJson: '{}',
        canonicalJson: '{}',
      },
      supersedePacketIds: ['seed-2026-07-26-r1'],
      itemWrites: [
        {
          op: 'add',
          defId: 'new-item',
          definition: {
            item_id: 'new-item',
            label: 'New',
            state: 'active',
            summary: '',
            tags: [],
            dashboard: { visible: true, order: 5, show_last_record_age: true },
            continuity: { carry_forward: true, quiet_after_days: 3 },
          },
        },
        { op: 'retire', defId: 'ghost-item', definition: null },
      ],
      promptWrites: [],
      recipeWrites: [],
      summary: {
        items: {
          additions: ['new-item'],
          updates: [],
          retirements: ['ghost-item'],
          unchanged: [],
        },
        prompts: { additions: [], updates: [], retirements: [], unchanged: [] },
        recipes: { additions: [], updates: [], retirements: [], unchanged: [] },
        supersededPacketIds: ['seed-2026-07-26-r1'],
        noop: false,
      },
      // A matching precondition so this reaches (and fails at) the retire guard
      // rather than being rejected earlier as a stale preview.
      precondition: {
        packetId: 'bad-r2',
        scopeFingerprint: await readScopeFingerprint(db, 'core-plan'),
      },
    };

    await expect(
      applyInstallPlan(db, badPlan, '2026-07-29T10:00:00.000Z'),
    ).rejects.toThrow();

    // Nothing changed: no new item, no new packet, prior packet still active.
    expect(await snapshotCounts(db)).toEqual(before);
    expect(await db.items.get(['core-plan', 'new-item'])).toBeUndefined();
    expect((await db.packets.get('seed-2026-07-26-r1'))?.status).toBe('active');
  });

  it('marks prior same-scope revisions superseded on install', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const rev2 = seedPacket();
    rev2.packet_id = 'seed-2026-07-26-r2';
    rev2.revision = 2;
    rev2.changes.items.upsert = [rev2.changes.items.upsert[0]];
    rev2.changes.prompts.upsert = [];
    rev2.changes.output_recipes.upsert = [];
    await install(db, rev2, '2026-07-29T10:00:00.000Z');

    expect((await db.packets.get('seed-2026-07-26-r1'))?.status).toBe(
      'superseded',
    );
    expect((await db.packets.get('seed-2026-07-26-r2'))?.status).toBe('active');
  });

  it('changes a definition source packet only when that definition changes', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const rev2 = seedPacket();
    rev2.packet_id = 'seed-2026-07-26-r2';
    rev2.revision = 2;
    // Re-state item 0 identically; genuinely change item 1; omit item 2.
    rev2.changes.items.upsert = [
      rev2.changes.items.upsert[0], // identical → unchanged
      { ...rev2.changes.items.upsert[1], summary: 'Changed.' },
    ];
    rev2.changes.prompts.upsert = [];
    rev2.changes.output_recipes.upsert = [];
    await install(db, rev2, '2026-07-29T10:00:00.000Z');

    const unchanged = await db.items.get(['core-plan', 'primary-project']);
    const changed = await db.items.get(['core-plan', 'movement-base']);
    expect(unchanged?.sourcePacketId).toBe('seed-2026-07-26-r1');
    expect(changed?.sourcePacketId).toBe('seed-2026-07-26-r2');
  });

  it('does not mutate state during preflight (before confirmation)', async () => {
    const db = freshDb();
    const result = await prepareInstall(db, seedPacket());
    expect(result.ok).toBe(true);
    // Preflight is read-only: nothing was written.
    expect(await db.packets.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
  });
});

describe('projected prompt reference validation', () => {
  it('rejects retiring an item still referenced by a prompt kept via omission', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');
    const before = await snapshotCounts(db);

    // Retire the item movement-result references, but omit movement-result.
    const rev2 = seedPacket();
    rev2.packet_id = 'seed-2026-07-26-r2';
    rev2.revision = 2;
    rev2.changes.items.upsert = [];
    rev2.changes.prompts.upsert = [];
    rev2.changes.output_recipes.upsert = [];
    rev2.changes.items.retire = ['movement-base'];

    const result = await prepareInstall(db, rev2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'prompt_missing_item')).toBe(
      true,
    );
    // Database is unchanged.
    expect(await snapshotCounts(db)).toEqual(before);
  });

  it('accepts retiring both the item and the prompt that references it', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const rev2 = seedPacket();
    rev2.packet_id = 'seed-2026-07-26-r2';
    rev2.revision = 2;
    rev2.changes.items.upsert = [];
    rev2.changes.prompts.upsert = [];
    rev2.changes.output_recipes.upsert = [];
    rev2.changes.items.retire = ['movement-base'];
    rev2.changes.prompts.retire = ['movement-result'];

    const result = await prepareInstall(db, rev2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await applyInstallPlan(db, result.plan, '2026-07-29T10:00:00.000Z');

    expect((await db.items.get(['core-plan', 'movement-base']))?.retired).toBe(
      true,
    );
    expect(
      (await db.prompts.get(['core-plan', 'movement-result']))?.retired,
    ).toBe(true);
  });

  it('accepts updating the prompt to reference another available same-scope item', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const rev2 = seedPacket();
    rev2.packet_id = 'seed-2026-07-26-r2';
    rev2.revision = 2;
    // Retire movement-base, but repoint the prompt at another live item.
    const prompt = { ...rev2.changes.prompts.upsert[1], item_id: 'food-system' };
    rev2.changes.items.upsert = [];
    rev2.changes.prompts.upsert = [prompt];
    rev2.changes.output_recipes.upsert = [];
    rev2.changes.items.retire = ['movement-base'];

    const result = await prepareInstall(db, rev2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await applyInstallPlan(db, result.plan, '2026-07-29T10:00:00.000Z');

    const stored = await db.prompts.get(['core-plan', 'movement-result']);
    expect(stored?.definition.item_id).toBe('food-system');
    expect((await db.items.get(['core-plan', 'movement-base']))?.retired).toBe(
      true,
    );
  });
});

describe('stale preview protection', () => {
  function revision(id: string, rev: number): PlanPacket {
    const packet = seedPacket();
    packet.packet_id = id;
    packet.revision = rev;
    packet.changes.items.upsert = [
      { ...packet.changes.items.upsert[0], summary: `Revision ${rev}.` },
    ];
    packet.changes.prompts.upsert = [];
    packet.changes.output_recipes.upsert = [];
    return packet;
  }

  it('rejects committing a stale plan and mutates nothing', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    // Prepare revision 2 against the seed state, but do not confirm yet.
    const prepared2 = await prepareInstall(db, revision('seed-r2', 2));
    expect(prepared2.ok).toBe(true);
    if (!prepared2.ok) return;

    // A concurrent flow installs revision 3 first.
    await install(db, revision('seed-r3', 3), '2026-07-29T09:00:00.000Z');
    const before = await snapshotCounts(db);

    // Confirming the now-stale revision-2 plan is rejected without mutation.
    const result = await commitInstall(db, prepared2.plan);
    expect(result).toEqual({ ok: false, reason: 'stale' });
    expect(await snapshotCounts(db)).toEqual(before);
    expect(await db.packets.get('seed-r2')).toBeUndefined();
    expect((await db.packets.get('seed-r3'))?.status).toBe('active');
  });

  it('rejects at commit when the packet id was claimed after preview', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    // Prepare a packet for a brand-new scope with packet id "shared".
    const pending = seedPacket();
    pending.packet_id = 'shared';
    pending.scope_id = 'scope-a';
    pending.changes.items.upsert = [pending.changes.items.upsert[0]];
    pending.changes.prompts.upsert = [];
    pending.changes.output_recipes.upsert = [];
    const prepared = await prepareInstall(db, pending);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    // Another flow claims packet id "shared" in a different scope first.
    const claimer = seedPacket();
    claimer.packet_id = 'shared';
    claimer.scope_id = 'scope-b';
    claimer.changes.items.upsert = [claimer.changes.items.upsert[0]];
    claimer.changes.prompts.upsert = [];
    claimer.changes.output_recipes.upsert = [];
    await install(db, claimer, '2026-07-29T09:00:00.000Z');

    const result = await commitInstall(db, prepared.plan);
    expect(result).toEqual({ ok: false, reason: 'stale' });
    // Only the claimer's scope-b row exists for "shared".
    const shared = await db.packets.get('shared');
    expect(shared?.scopeId).toBe('scope-b');
    expect(await db.items.where('scopeId').equals('scope-a').count()).toBe(0);
  });

  it('commits successfully when nothing changed between preview and confirm', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const prepared = await prepareInstall(db, revision('seed-r2', 2));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const result = await commitInstall(db, prepared.plan);
    expect(result).toEqual({ ok: true });
    expect((await db.packets.get('seed-r2'))?.status).toBe('active');
  });

  it('is not invalidated by a cross-scope change that leaves the packet id free', async () => {
    const db = freshDb();
    await install(db, seedPacket(), '2026-07-28T10:00:00.000Z');

    const prepared = await prepareInstall(db, revision('seed-r2', 2));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    // A wholly unrelated packet installs in another scope before confirm.
    const other = seedPacket();
    other.packet_id = 'other-r1';
    other.scope_id = 'side-plan';
    other.changes.items.upsert = [other.changes.items.upsert[0]];
    other.changes.prompts.upsert = [];
    other.changes.output_recipes.upsert = [];
    await install(db, other, '2026-07-29T09:00:00.000Z');

    // The core-plan revision-2 plan is still valid and commits.
    const result = await commitInstall(db, prepared.plan);
    expect(result).toEqual({ ok: true });
    expect((await db.packets.get('seed-r2'))?.status).toBe('active');
    expect((await db.packets.get('seed-2026-07-26-r1'))?.status).toBe(
      'superseded',
    );
  });
});

async function snapshotCounts(db: Life365Db) {
  return {
    packets: await db.packets.count(),
    items: await db.items.count(),
    prompts: await db.prompts.count(),
    recipes: await db.outputRecipes.count(),
  };
}
