/**
 * Deterministic fingerprint of a scope's installed state.
 *
 * A pure function that reduces the packets and definitions of one scope to a
 * single canonical string. Two structurally-equal scope states always produce
 * the same fingerprint, which lets the commit path detect — without guessing —
 * whether installed state changed between preview and confirmation. Inputs are
 * sorted by stable id first, so ordering never affects the result.
 */

import { canonicalJson } from './canonicalJson';
import type { FingerprintDef, ScopeFingerprintInput } from './installTypes';

export function computeScopeFingerprint(input: ScopeFingerprintInput): string {
  const packets = input.packets
    .map((p) => ({
      packetId: p.packetId,
      revision: p.revision,
      status: p.status,
    }))
    .sort(byPacketId);

  return canonicalJson({
    packets,
    items: sortDefs(input.items),
    prompts: sortDefs(input.prompts),
    recipes: sortDefs(input.recipes),
  });
}

function sortDefs(defs: FingerprintDef[]): FingerprintDef[] {
  return defs
    .map((d) => ({ defId: d.defId, retired: d.retired, canonical: d.canonical }))
    .sort((a, b) => (a.defId < b.defId ? -1 : a.defId > b.defId ? 1 : 0));
}

function byPacketId(
  a: { packetId: string },
  b: { packetId: string },
): number {
  return a.packetId < b.packetId ? -1 : a.packetId > b.packetId ? 1 : 0;
}
