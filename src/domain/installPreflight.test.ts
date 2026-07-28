import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonicalJson';
import { installPreflight } from './installPreflight';
import type {
  InstallSnapshot,
  SnapshotDefinition,
  SnapshotPacket,
} from './installTypes';
import type { PlanItem, PlanPacket, Prompt } from './planPacket';
import { validatePlanPacketJson } from './validatePlanPacket';

const seedPath = fileURLToPath(
  new URL('../../examples/seed-plan-packet.v0.1.json', import.meta.url),
);
const seedJson = readFileSync(seedPath, 'utf-8');

function seedPacket(): PlanPacket {
  const result = validatePlanPacketJson(seedJson);
  if (!result.ok) throw new Error('seed fixture should validate');
  return result.packet;
}

const emptySnapshot: InstallSnapshot = {
  scopeId: 'core-plan',
  packets: [],
  items: [],
  prompts: [],
  recipes: [],
};

function snapshotDef(def: PlanItem | Prompt, retired = false): SnapshotDefinition {
  const id = 'prompt_id' in def ? def.prompt_id : def.item_id;
  return { defId: id, retired, canonicalDefinition: canonicalJson(def) };
}

/** Build a snapshot representing the seed packet already installed. */
function installedSeedSnapshot(): InstallSnapshot {
  const packet = seedPacket();
  const packetRow: SnapshotPacket = {
    packetId: packet.packet_id,
    scopeId: packet.scope_id,
    revision: packet.revision,
    status: 'active',
    canonicalJson: canonicalJson(packet),
  };
  return {
    scopeId: packet.scope_id,
    packets: [packetRow],
    items: packet.changes.items.upsert.map((i) => snapshotDef(i)),
    prompts: packet.changes.prompts.upsert.map((p) => snapshotDef(p)),
    recipes: packet.changes.output_recipes.upsert.map((r) => ({
      defId: r.recipe_id,
      retired: false,
      canonicalDefinition: canonicalJson(r),
    })),
  };
}

describe('installPreflight — fresh install', () => {
  it('classifies every seed definition as an addition against empty state', () => {
    const result = installPreflight(seedPacket(), emptySnapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.noop).toBe(false);
    expect(result.plan.summary.items.additions).toEqual([
      'primary-project',
      'movement-base',
      'food-system',
    ]);
    expect(result.plan.summary.prompts.additions.length).toBe(2);
    expect(result.plan.summary.recipes.additions.length).toBe(1);
    expect(result.plan.supersedePacketIds).toEqual([]);
    expect(result.plan.itemWrites).toHaveLength(3);
  });

  it('is separate from schema validation (consumes an already-validated packet)', () => {
    // Validation is a prior, independent stage; preflight does no schema work.
    const validation = validatePlanPacketJson(seedJson);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const result = installPreflight(validation.packet, emptySnapshot);
    expect(result.ok).toBe(true);
  });
});

describe('installPreflight — exact reimport', () => {
  it('treats an identical already-installed packet as an idempotent no-op', () => {
    const result = installPreflight(seedPacket(), installedSeedSnapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.noop).toBe(true);
    expect(result.plan.itemWrites).toHaveLength(0);
    expect(result.plan.supersedePacketIds).toEqual([]);
  });
});

describe('installPreflight — rejections', () => {
  it('rejects a stale revision without producing a plan', () => {
    const snapshot = installedSeedSnapshot();
    // A distinct, later packet is installed, so the incoming revision 1 is
    // stale (a different packet id keeps this out of the exact-reimport path).
    snapshot.packets[0] = {
      ...snapshot.packets[0],
      packetId: 'seed-2026-07-26-r5',
      revision: 5,
    };

    const result = installPreflight(seedPacket(), snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'stale_revision')).toBe(true);
  });

  it('rejects reusing a packet id with different content', () => {
    const snapshot = installedSeedSnapshot();
    // Same packet id already recorded, but with different stored content.
    snapshot.packets[0] = {
      ...snapshot.packets[0],
      canonicalJson: canonicalJson({ different: true }),
    };

    const result = installPreflight(seedPacket(), snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'packet_id_reused')).toBe(true);
  });

  it('rejects duplicate ids within an upsert list', () => {
    const packet = seedPacket();
    packet.changes.items.upsert.push({
      ...packet.changes.items.upsert[0],
    });

    const result = installPreflight(packet, emptySnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'duplicate_upsert_id')).toBe(
      true,
    );
  });

  it('rejects an id appearing in both upsert and retire', () => {
    const snapshot = emptySnapshot;
    const packet = seedPacket();
    packet.changes.items.retire = ['primary-project'];

    const result = installPreflight(packet, snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.code === 'upsert_retire_conflict'),
    ).toBe(true);
  });

  it('rejects a prompt referencing an item that will not be available', () => {
    const packet = seedPacket();
    // Point a prompt at an item id no packet provides.
    packet.changes.prompts.upsert[0] = {
      ...packet.changes.prompts.upsert[0],
      item_id: 'nonexistent-item',
    };

    const result = installPreflight(packet, emptySnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'prompt_missing_item')).toBe(
      true,
    );
  });

  it('rejects retiring a target that was never installed', () => {
    const packet = seedPacket();
    packet.changes.items.retire = ['never-installed'];

    const result = installPreflight(packet, emptySnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.code === 'retire_target_missing'),
    ).toBe(true);
  });
});

describe('installPreflight — revision supersession and source attribution', () => {
  it('supersedes the prior active packet and only touches the changed item', () => {
    const snapshot = installedSeedSnapshot();
    const packet = seedPacket();
    // Revision 2 changes one item and omits the other two.
    packet.packet_id = 'seed-2026-07-26-r2';
    packet.revision = 2;
    const changed: PlanItem = {
      ...packet.changes.items.upsert[0],
      summary: 'Updated summary for revision 2.',
    };
    packet.changes.items.upsert = [changed];
    packet.changes.prompts.upsert = [];
    packet.changes.output_recipes.upsert = [];

    const result = installPreflight(packet, snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.noop).toBe(false);
    expect(result.plan.supersedePacketIds).toEqual(['seed-2026-07-26-r1']);
    expect(result.plan.summary.items.updates).toEqual(['primary-project']);
    // The omitted items produce no writes at all.
    expect(result.plan.itemWrites).toHaveLength(1);
  });

  it('classifies a re-stated identical definition as unchanged (no write)', () => {
    const snapshot = installedSeedSnapshot();
    const packet = seedPacket();
    packet.packet_id = 'seed-2026-07-26-r2';
    packet.revision = 2;
    // Re-state the first item byte-for-byte; change nothing else.
    packet.changes.items.upsert = [packet.changes.items.upsert[0]];
    packet.changes.prompts.upsert = [];
    packet.changes.output_recipes.upsert = [];

    const result = installPreflight(packet, snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.summary.items.unchanged).toEqual(['primary-project']);
    expect(result.plan.itemWrites).toHaveLength(0);
  });
});
