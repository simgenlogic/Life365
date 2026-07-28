/**
 * Deterministic installation preflight for validated Plan Packets.
 *
 * `installPreflight` is a pure function of (validated packet, installed-state
 * snapshot). It never touches IndexedDB or React state. It either returns a
 * complete installation plan or a list of structured installation errors,
 * enforcing the continuity rule that omission never removes state: only ids
 * that appear in an `upsert` or `retire` list ever change.
 *
 * Installation errors here are distinct from JSON/schema validation errors,
 * which are produced earlier and separately by `validatePlanPacket`.
 */

import { canonicalJson } from './canonicalJson';
import type {
  OutputRecipe,
  PlanItem,
  PlanPacket,
  Prompt,
} from './planPacket';
import type {
  ChangeSummary,
  DefWrite,
  InstallError,
  InstallObjectType,
  InstallPlan,
  InstallSnapshot,
  PreflightResult,
  SnapshotDefinition,
  TypeChangeSummary,
} from './installTypes';

/** An upsert entry reduced to the fields classification needs. */
interface UpsertEntry {
  id: string;
  definition: PlanItem | Prompt | OutputRecipe;
  canonical: string;
}

export function installPreflight(
  packet: PlanPacket,
  snapshot: InstallSnapshot,
): PreflightResult {
  const incomingCanonical = canonicalJson(packet);

  // --- Exact re-import: an identical, already-installed packet is a no-op. ---
  const existingWithSameId = snapshot.packets.find(
    (p) => p.packetId === packet.packet_id,
  );
  if (
    existingWithSameId &&
    existingWithSameId.scopeId === packet.scope_id &&
    existingWithSameId.canonicalJson === incomingCanonical
  ) {
    return { ok: true, plan: makeNoopPlan(packet, incomingCanonical) };
  }

  const errors: InstallError[] = [];

  // Check 2: a different packet reuses an existing packet_id (packet ids are
  // globally unique; reuse across scopes is also rejected).
  if (existingWithSameId) {
    errors.push({
      code: 'packet_id_reused',
      objectType: 'packet',
      id: packet.packet_id,
      message: `Packet id "${packet.packet_id}" already identifies a different installed packet.`,
    });
  }

  // Check 1: revision must strictly increase within the scope.
  const scopePackets = snapshot.packets.filter(
    (p) => p.scopeId === packet.scope_id,
  );
  const maxRevision = scopePackets.reduce(
    (max, p) => Math.max(max, p.revision),
    0,
  );
  if (scopePackets.length > 0) {
    if (packet.revision < maxRevision) {
      errors.push({
        code: 'stale_revision',
        objectType: 'packet',
        id: packet.packet_id,
        message: `Revision ${packet.revision} is older than installed revision ${maxRevision} for scope "${packet.scope_id}".`,
      });
    } else if (packet.revision === maxRevision) {
      errors.push({
        code: 'revision_conflict',
        objectType: 'packet',
        id: packet.packet_id,
        message: `Revision ${packet.revision} is already installed for scope "${packet.scope_id}".`,
      });
    }
  }

  const items = toUpsertEntries(
    packet.changes.items.upsert,
    (i) => i.item_id,
  );
  const prompts = toUpsertEntries(
    packet.changes.prompts.upsert,
    (p) => p.prompt_id,
  );
  const recipes = toUpsertEntries(
    packet.changes.output_recipes.upsert,
    (r) => r.recipe_id,
  );

  // Check 3: duplicate ids within one upsert list.
  collectDuplicateUpserts(items, 'item', errors);
  collectDuplicateUpserts(prompts, 'prompt', errors);
  collectDuplicateUpserts(recipes, 'output_recipe', errors);

  // Check 4: the same id appears in both upsert and retire for one type.
  collectUpsertRetireConflicts(
    items,
    packet.changes.items.retire,
    'item',
    errors,
  );
  collectUpsertRetireConflicts(
    prompts,
    packet.changes.prompts.retire,
    'prompt',
    errors,
  );
  collectUpsertRetireConflicts(
    recipes,
    packet.changes.output_recipes.retire,
    'output_recipe',
    errors,
  );

  // Check 6: a retire target must already exist in the scope. Retiring an id
  // that was never installed is a malformed/ambiguous operation.
  collectMissingRetireTargets(
    packet.changes.items.retire,
    snapshot.items,
    'item',
    errors,
  );
  collectMissingRetireTargets(
    packet.changes.prompts.retire,
    snapshot.prompts,
    'prompt',
    errors,
  );
  collectMissingRetireTargets(
    packet.changes.output_recipes.retire,
    snapshot.recipes,
    'output_recipe',
    errors,
  );

  // Check 5: every upserted prompt's item reference must resolve to an item
  // that is available in the scope after the proposed installation.
  const projectedItems = computeProjectedItemIds(snapshot.items, {
    upsertIds: items.map((i) => i.id),
    retireIds: packet.changes.items.retire,
  });
  for (const prompt of packet.changes.prompts.upsert) {
    if (prompt.item_id !== undefined && !projectedItems.has(prompt.item_id)) {
      errors.push({
        code: 'prompt_missing_item',
        objectType: 'prompt',
        id: prompt.prompt_id,
        message: `Prompt "${prompt.prompt_id}" references item "${prompt.item_id}", which will not be an available item in scope "${packet.scope_id}" after installation.`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // --- Build the plan by classifying each change against current state. ---
  const itemPlan = classify(items, packet.changes.items.retire, snapshot.items);
  const promptPlan = classify(
    prompts,
    packet.changes.prompts.retire,
    snapshot.prompts,
  );
  const recipePlan = classify(
    recipes,
    packet.changes.output_recipes.retire,
    snapshot.recipes,
  );

  const supersedePacketIds = snapshot.packets
    .filter((p) => p.scopeId === packet.scope_id && p.status === 'active')
    .map((p) => p.packetId);

  const summary: ChangeSummary = {
    items: itemPlan.summary,
    prompts: promptPlan.summary,
    recipes: recipePlan.summary,
    supersededPacketIds: supersedePacketIds,
    noop: false,
  };

  const plan: InstallPlan = {
    noop: false,
    scopeId: packet.scope_id,
    packet: {
      packetId: packet.packet_id,
      scopeId: packet.scope_id,
      revision: packet.revision,
      schema: packet.schema,
      title: packet.title,
      summary: packet.summary,
      createdAt: packet.created_at,
      rawJson: incomingCanonical,
      canonicalJson: incomingCanonical,
    },
    supersedePacketIds,
    itemWrites: itemPlan.writes,
    promptWrites: promptPlan.writes,
    recipeWrites: recipePlan.writes,
    summary,
  };

  return { ok: true, plan };
}

function makeNoopPlan(packet: PlanPacket, canonical: string): InstallPlan {
  const emptySummary: TypeChangeSummary = {
    additions: [],
    updates: [],
    retirements: [],
    unchanged: [],
  };
  return {
    noop: true,
    scopeId: packet.scope_id,
    packet: {
      packetId: packet.packet_id,
      scopeId: packet.scope_id,
      revision: packet.revision,
      schema: packet.schema,
      title: packet.title,
      summary: packet.summary,
      createdAt: packet.created_at,
      rawJson: canonical,
      canonicalJson: canonical,
    },
    supersedePacketIds: [],
    itemWrites: [],
    promptWrites: [],
    recipeWrites: [],
    summary: {
      items: emptySummary,
      prompts: { ...emptySummary },
      recipes: { ...emptySummary },
      supersededPacketIds: [],
      noop: true,
    },
  };
}

function toUpsertEntries<T extends PlanItem | Prompt | OutputRecipe>(
  upserts: T[],
  idOf: (value: T) => string,
): UpsertEntry[] {
  return upserts.map((value) => ({
    id: idOf(value),
    definition: value,
    canonical: canonicalJson(value),
  }));
}

function collectDuplicateUpserts(
  entries: UpsertEntry[],
  objectType: InstallObjectType,
  errors: InstallError[],
): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id) && !reported.has(entry.id)) {
      reported.add(entry.id);
      errors.push({
        code: 'duplicate_upsert_id',
        objectType,
        id: entry.id,
        message: `Id "${entry.id}" appears more than once in the ${objectType} upsert list.`,
      });
    }
    seen.add(entry.id);
  }
}

function collectUpsertRetireConflicts(
  entries: UpsertEntry[],
  retireIds: string[],
  objectType: InstallObjectType,
  errors: InstallError[],
): void {
  const upsertIds = new Set(entries.map((e) => e.id));
  for (const id of retireIds) {
    if (upsertIds.has(id)) {
      errors.push({
        code: 'upsert_retire_conflict',
        objectType,
        id,
        message: `Id "${id}" appears in both the ${objectType} upsert and retire lists.`,
      });
    }
  }
}

function collectMissingRetireTargets(
  retireIds: string[],
  existing: SnapshotDefinition[],
  objectType: InstallObjectType,
  errors: InstallError[],
): void {
  const existingIds = new Set(existing.map((e) => e.defId));
  for (const id of retireIds) {
    if (!existingIds.has(id)) {
      errors.push({
        code: 'retire_target_missing',
        objectType,
        id,
        message: `Retire target "${id}" is not an installed ${objectType} in this scope.`,
      });
    }
  }
}

function computeProjectedItemIds(
  existing: SnapshotDefinition[],
  changes: { upsertIds: string[]; retireIds: string[] },
): Set<string> {
  const projected = new Set<string>();
  for (const item of existing) {
    if (!item.retired) projected.add(item.defId);
  }
  for (const id of changes.upsertIds) projected.add(id);
  for (const id of changes.retireIds) projected.delete(id);
  return projected;
}

function classify(
  entries: UpsertEntry[],
  retireIds: string[],
  existing: SnapshotDefinition[],
): { writes: DefWrite[]; summary: TypeChangeSummary } {
  const existingById = new Map(existing.map((e) => [e.defId, e]));
  const writes: DefWrite[] = [];
  const additions: string[] = [];
  const updates: string[] = [];
  const retirements: string[] = [];
  const unchanged: string[] = [];

  for (const entry of entries) {
    const current = existingById.get(entry.id);
    if (!current) {
      additions.push(entry.id);
      writes.push({ op: 'add', defId: entry.id, definition: entry.definition });
    } else if (current.retired) {
      // Re-adding a retired definition revives it; that is an explicit change.
      updates.push(entry.id);
      writes.push({
        op: 'update',
        defId: entry.id,
        definition: entry.definition,
      });
    } else if (current.canonicalDefinition === entry.canonical) {
      // Identical content: unchanged. Source packet and timestamp are kept, so
      // re-stating a definition never rewrites its provenance.
      unchanged.push(entry.id);
    } else {
      updates.push(entry.id);
      writes.push({
        op: 'update',
        defId: entry.id,
        definition: entry.definition,
      });
    }
  }

  for (const id of retireIds) {
    const current = existingById.get(id);
    if (current && !current.retired) {
      retirements.push(id);
      writes.push({ op: 'retire', defId: id, definition: null });
    } else {
      // Already retired (missing targets were rejected earlier): a no-op.
      unchanged.push(id);
    }
  }

  return { writes, summary: { additions, updates, retirements, unchanged } };
}
