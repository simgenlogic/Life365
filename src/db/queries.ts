/**
 * Read-only database queries for screens.
 *
 * These functions only read rows. Selection and ordering logic stays in pure
 * domain functions (e.g. `selectCarryForward`); this layer just fetches.
 */

import type { Life365Db, StoredItem, StoredPacket } from './database';

/** All installed items across every scope. */
export async function readAllItems(db: Life365Db): Promise<StoredItem[]> {
  return db.items.toArray();
}

/** All installed packet revisions, for the Packets history view. */
export async function readPacketHistory(
  db: Life365Db,
): Promise<StoredPacket[]> {
  return db.packets.toArray();
}
