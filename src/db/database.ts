/**
 * Local IndexedDB persistence for LIFE365, through Dexie.
 *
 * This module defines the versioned schema and the stored-row shapes. All
 * database access lives in the `db/` layer, never in React components
 * (PROJECT_SPEC.md §10, Packet 0001B §1/§6). Composite `[scopeId+id]` primary
 * keys keep definitions from different scopes from overwriting one another.
 *
 * Packet 0001B persists installed packets and installed definitions only.
 * Opportunities, records, and generated contexts are deferred to later packets.
 */

import Dexie, { type Table } from 'dexie';
import type { OutputRecipe, PlanItem, Prompt } from '../domain/planPacket';

export const DB_NAME = 'life365';
export const DB_SCHEMA_VERSION = 1;

/** An installed packet revision, preserved for durable history. */
export interface StoredPacket {
  packetId: string;
  scopeId: string;
  revision: number;
  schema: string;
  title: string;
  summary: string;
  /** `created_at` copied from the packet. */
  createdAt: string;
  /** When this packet was installed locally. */
  installedAt: string;
  status: 'active' | 'superseded';
  /** Traceable packet JSON. */
  rawJson: string;
  /** Canonical JSON for exact-reimport comparison. */
  canonicalJson: string;
}

/** Common provenance fields shared by every installed definition row. */
interface StoredDefinitionBase {
  scopeId: string;
  retired: boolean;
  /** Packet that most recently added, updated, or retired this definition. */
  sourcePacketId: string;
  updatedAt: string;
  retiredAt: string | null;
  retiredBySourcePacketId: string | null;
}

export interface StoredItem extends StoredDefinitionBase {
  itemId: string;
  definition: PlanItem;
}

export interface StoredPrompt extends StoredDefinitionBase {
  promptId: string;
  /** Denormalized from the definition for same-scope item indexing. */
  itemId: string | null;
  definition: Prompt;
}

export interface StoredRecipe extends StoredDefinitionBase {
  recipeId: string;
  definition: OutputRecipe;
}

/** Small key/value table for database metadata. */
export interface AppMetaRecord {
  key: string;
  value: unknown;
}

export class Life365Db extends Dexie {
  packets!: Table<StoredPacket, string>;
  items!: Table<StoredItem, [string, string]>;
  prompts!: Table<StoredPrompt, [string, string]>;
  outputRecipes!: Table<StoredRecipe, [string, string]>;
  appMeta!: Table<AppMetaRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(DB_SCHEMA_VERSION).stores({
      packets: 'packetId, scopeId, status, [scopeId+revision]',
      items: '[scopeId+itemId], scopeId',
      prompts: '[scopeId+promptId], scopeId, [scopeId+itemId]',
      outputRecipes: '[scopeId+recipeId], scopeId',
      appMeta: 'key',
    });
    this.on('populate', () => {
      this.appMeta.put({ key: 'schemaVersion', value: DB_SCHEMA_VERSION });
    });
  }
}

let singleton: Life365Db | null = null;

/** Shared application database instance. */
export function getDb(): Life365Db {
  if (!singleton) {
    singleton = new Life365Db();
  }
  return singleton;
}
