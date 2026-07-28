/**
 * Applies an accepted installation plan in a single IndexedDB transaction.
 *
 * Transaction semantics (Packet 0001B §3):
 *  - Omission never removes state: only ids named in the plan's writes change.
 *  - Retirement is explicit and flips a flag; the definition is preserved.
 *  - Installing a newer revision supersedes prior active packets in the scope
 *    without touching omitted definitions or other scopes.
 *  - Failure is atomic: any thrown error rolls the whole transaction back.
 *  - History is durable: superseded packets and retired definitions remain.
 *  - Source attribution: a write sets the definition's source to this packet.
 *
 * The plan was fully decided during pure preflight; this layer only writes.
 */

import type { OutputRecipe, PlanItem, Prompt } from '../domain/planPacket';
import type { DefWrite, InstallPlan } from '../domain/installTypes';
import type {
  Life365Db,
  StoredItem,
  StoredPrompt,
  StoredRecipe,
} from './database';

/**
 * Apply `plan`, stamping every write with `now`. A no-op plan makes no changes.
 * On any failure the transaction rolls back, leaving all tables untouched.
 */
export async function applyInstallPlan(
  db: Life365Db,
  plan: InstallPlan,
  now: string,
): Promise<void> {
  if (plan.noop) return;

  await db.transaction(
    'rw',
    db.packets,
    db.items,
    db.prompts,
    db.outputRecipes,
    async () => {
      // Supersede prior active packets in this scope.
      for (const packetId of plan.supersedePacketIds) {
        const existing = await db.packets.get(packetId);
        if (existing && existing.status !== 'superseded') {
          await db.packets.update(packetId, { status: 'superseded' });
        }
      }

      // Insert the newly-installed packet as active.
      await db.packets.put({
        packetId: plan.packet.packetId,
        scopeId: plan.packet.scopeId,
        revision: plan.packet.revision,
        schema: plan.packet.schema,
        title: plan.packet.title,
        summary: plan.packet.summary,
        createdAt: plan.packet.createdAt,
        installedAt: now,
        status: 'active',
        rawJson: plan.packet.rawJson,
        canonicalJson: plan.packet.canonicalJson,
      });

      const packetId = plan.packet.packetId;
      const scopeId = plan.scopeId;

      for (const write of plan.itemWrites) {
        await applyItemWrite(db, scopeId, packetId, write, now);
      }
      for (const write of plan.promptWrites) {
        await applyPromptWrite(db, scopeId, packetId, write, now);
      }
      for (const write of plan.recipeWrites) {
        await applyRecipeWrite(db, scopeId, packetId, write, now);
      }
    },
  );
}

async function applyItemWrite(
  db: Life365Db,
  scopeId: string,
  packetId: string,
  write: DefWrite,
  now: string,
): Promise<void> {
  if (write.op === 'retire') {
    const existing = await db.items.get([scopeId, write.defId]);
    if (!existing) {
      throw new Error(
        `Cannot retire item "${write.defId}" in scope "${scopeId}": not installed.`,
      );
    }
    await db.items.update([scopeId, write.defId], {
      retired: true,
      sourcePacketId: packetId,
      updatedAt: now,
      retiredAt: now,
      retiredBySourcePacketId: packetId,
    });
    return;
  }

  const definition = write.definition as PlanItem;
  const row: StoredItem = {
    scopeId,
    itemId: write.defId,
    retired: false,
    definition,
    sourcePacketId: packetId,
    updatedAt: now,
    retiredAt: null,
    retiredBySourcePacketId: null,
  };
  await db.items.put(row);
}

async function applyPromptWrite(
  db: Life365Db,
  scopeId: string,
  packetId: string,
  write: DefWrite,
  now: string,
): Promise<void> {
  if (write.op === 'retire') {
    const existing = await db.prompts.get([scopeId, write.defId]);
    if (!existing) {
      throw new Error(
        `Cannot retire prompt "${write.defId}" in scope "${scopeId}": not installed.`,
      );
    }
    await db.prompts.update([scopeId, write.defId], {
      retired: true,
      sourcePacketId: packetId,
      updatedAt: now,
      retiredAt: now,
      retiredBySourcePacketId: packetId,
    });
    return;
  }

  const definition = write.definition as Prompt;
  const row: StoredPrompt = {
    scopeId,
    promptId: write.defId,
    itemId: definition.item_id ?? null,
    retired: false,
    definition,
    sourcePacketId: packetId,
    updatedAt: now,
    retiredAt: null,
    retiredBySourcePacketId: null,
  };
  await db.prompts.put(row);
}

async function applyRecipeWrite(
  db: Life365Db,
  scopeId: string,
  packetId: string,
  write: DefWrite,
  now: string,
): Promise<void> {
  if (write.op === 'retire') {
    const existing = await db.outputRecipes.get([scopeId, write.defId]);
    if (!existing) {
      throw new Error(
        `Cannot retire output recipe "${write.defId}" in scope "${scopeId}": not installed.`,
      );
    }
    await db.outputRecipes.update([scopeId, write.defId], {
      retired: true,
      sourcePacketId: packetId,
      updatedAt: now,
      retiredAt: now,
      retiredBySourcePacketId: packetId,
    });
    return;
  }

  const definition = write.definition as OutputRecipe;
  const row: StoredRecipe = {
    scopeId,
    recipeId: write.defId,
    retired: false,
    definition,
    sourcePacketId: packetId,
    updatedAt: now,
    retiredAt: null,
    retiredBySourcePacketId: null,
  };
  await db.outputRecipes.put(row);
}
