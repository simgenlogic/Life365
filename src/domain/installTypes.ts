/**
 * Shared types for deterministic packet-installation preflight and planning.
 *
 * These describe the *pure* installation contract: the read-only snapshot the
 * preflight consumes, the plan it produces, and the structured errors it may
 * return. Nothing here imports Dexie or React — the database layer maps its
 * stored rows onto these plain shapes, and the transaction layer consumes the
 * plan. Installation rules therefore live entirely outside the persistence and
 * rendering layers (Packet 0001B §6).
 */

import type { OutputRecipe, PlanItem, Prompt } from './planPacket';

/** The kind of object an installation change or error concerns. */
export type InstallObjectType = 'item' | 'prompt' | 'output_recipe' | 'packet';

/**
 * A previously-installed packet, reduced to the fields preflight needs for
 * global uniqueness, revision ordering, supersession, and exact-reimport
 * detection. Includes packets from every scope so `packet_id` reuse across
 * scopes can be rejected.
 */
export interface SnapshotPacket {
  packetId: string;
  scopeId: string;
  revision: number;
  status: 'active' | 'superseded';
  /** Canonical JSON of the stored packet, for exact-reimport comparison. */
  canonicalJson: string;
}

/**
 * A previously-installed definition (item, prompt, or output recipe) in the
 * target scope, reduced to what preflight needs to classify changes.
 */
export interface SnapshotDefinition {
  defId: string;
  retired: boolean;
  /** Canonical JSON of the stored definition content, for value comparison. */
  canonicalDefinition: string;
}

/**
 * Read-only view of currently-installed state relevant to installing one
 * packet. `packets` spans all scopes; the definition lists are scoped to the
 * incoming packet's scope.
 */
export interface InstallSnapshot {
  scopeId: string;
  packets: SnapshotPacket[];
  items: SnapshotDefinition[];
  prompts: SnapshotDefinition[];
  recipes: SnapshotDefinition[];
}

/** A single mutating write the transaction layer must apply. */
export type WriteOp = 'add' | 'update' | 'retire';

export interface DefWrite {
  op: WriteOp;
  defId: string;
  /** Present for `add`/`update`; `null` for `retire`. */
  definition: PlanItem | Prompt | OutputRecipe | null;
}

/** Packet metadata to persist when a plan is applied. */
export interface InstallPlanPacket {
  packetId: string;
  scopeId: string;
  revision: number;
  schema: string;
  title: string;
  summary: string;
  createdAt: string;
  /** Traceable packet JSON, defaulting to canonical form. */
  rawJson: string;
  /** Canonical JSON used for exact-reimport comparison. */
  canonicalJson: string;
}

/** Per-object-type classification of proposed changes. */
export interface TypeChangeSummary {
  additions: string[];
  updates: string[];
  retirements: string[];
  unchanged: string[];
}

/** Human-readable classification of everything a plan will do. */
export interface ChangeSummary {
  items: TypeChangeSummary;
  prompts: TypeChangeSummary;
  recipes: TypeChangeSummary;
  supersededPacketIds: string[];
  /** True only when the exact same packet is already installed. */
  noop: boolean;
}

/**
 * A complete, deterministic installation plan. Applying it is a mechanical
 * translation into IndexedDB writes; all decisions were made during preflight.
 */
export interface InstallPlan {
  noop: boolean;
  scopeId: string;
  packet: InstallPlanPacket;
  /** Currently-active packets in this scope to mark superseded. */
  supersedePacketIds: string[];
  itemWrites: DefWrite[];
  promptWrites: DefWrite[];
  recipeWrites: DefWrite[];
  summary: ChangeSummary;
}

/** Machine-readable reason an installation was rejected. */
export type InstallErrorCode =
  | 'packet_id_reused'
  | 'stale_revision'
  | 'revision_conflict'
  | 'duplicate_upsert_id'
  | 'upsert_retire_conflict'
  | 'retire_target_missing'
  | 'prompt_missing_item';

export interface InstallError {
  code: InstallErrorCode;
  message: string;
  objectType: InstallObjectType;
  id?: string;
}

export type PreflightResult =
  | { ok: true; plan: InstallPlan }
  | { ok: false; errors: InstallError[] };
