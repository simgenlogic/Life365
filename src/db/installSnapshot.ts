/**
 * Builds the read-only installation snapshot the pure preflight consumes.
 *
 * This is the seam between persistence and the deterministic installer: it
 * reads current rows and projects them onto the plain `InstallSnapshot` shape.
 * Packets from every scope are included so global `packet_id` uniqueness can be
 * checked; definition lists are scoped to the incoming packet's scope.
 */

import { canonicalJson } from '../domain/canonicalJson';
import type {
  InstallSnapshot,
  SnapshotDefinition,
} from '../domain/installTypes';
import type { Life365Db } from './database';

export async function readInstallSnapshot(
  db: Life365Db,
  scopeId: string,
): Promise<InstallSnapshot> {
  // Read every table in one read transaction so the snapshot is internally
  // coherent — no row can change between the four reads.
  return db.transaction(
    'r',
    db.packets,
    db.items,
    db.prompts,
    db.outputRecipes,
    async () => {
      const [allPackets, items, prompts, recipes] = await Promise.all([
        db.packets.toArray(),
        db.items.where('scopeId').equals(scopeId).toArray(),
        db.prompts.where('scopeId').equals(scopeId).toArray(),
        db.outputRecipes.where('scopeId').equals(scopeId).toArray(),
      ]);

      return {
        scopeId,
        packets: allPackets.map((p) => ({
          packetId: p.packetId,
          scopeId: p.scopeId,
          revision: p.revision,
          status: p.status,
          canonicalJson: p.canonicalJson,
        })),
        items: items.map((i) =>
          toSnapshotDefinition(i.itemId, i.retired, i.definition),
        ),
        prompts: prompts.map((p) =>
          toSnapshotDefinition(
            p.promptId,
            p.retired,
            p.definition,
            p.itemId ?? p.definition.item_id ?? null,
          ),
        ),
        recipes: recipes.map((r) =>
          toSnapshotDefinition(r.recipeId, r.retired, r.definition),
        ),
      };
    },
  );
}

function toSnapshotDefinition(
  defId: string,
  retired: boolean,
  definition: unknown,
  itemRef: string | null = null,
): SnapshotDefinition {
  return {
    defId,
    retired,
    canonicalDefinition: canonicalJson(definition),
    itemRef,
  };
}
