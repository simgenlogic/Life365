/**
 * Orchestrates the two-step install flow for the Packets screen.
 *
 * `prepareInstall` reads a snapshot and runs the pure preflight; it mutates
 * nothing, so the screen can preview proposed changes or errors before the user
 * confirms. `commitInstall` applies an already-approved plan atomically.
 *
 * Keeping these separate enforces "no installation path mutates state before
 * confirmation" (Packet 0001B §4/§7).
 */

import { installPreflight } from '../domain/installPreflight';
import type { PlanPacket } from '../domain/planPacket';
import type { InstallPlan, PreflightResult } from '../domain/installTypes';
import type { Life365Db } from './database';
import { applyInstallPlan } from './applyInstall';
import { readInstallSnapshot } from './installSnapshot';

/**
 * Run installation preflight for a validated packet against current state.
 * Read-only: it never writes to IndexedDB. When `rawText` is supplied it is
 * stored verbatim as the packet's traceable JSON on success.
 */
export async function prepareInstall(
  db: Life365Db,
  packet: PlanPacket,
  rawText?: string,
): Promise<PreflightResult> {
  const snapshot = await readInstallSnapshot(db, packet.scope_id);
  const result = installPreflight(packet, snapshot);
  if (result.ok && rawText !== undefined) {
    result.plan.packet.rawJson = rawText;
  }
  return result;
}

/** Apply an approved plan atomically, stamping the current time. */
export async function commitInstall(
  db: Life365Db,
  plan: InstallPlan,
): Promise<void> {
  await applyInstallPlan(db, plan, new Date().toISOString());
}
