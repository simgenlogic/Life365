/**
 * Development-only access to the seed Plan Packet fixture.
 *
 * The seed JSON is imported as raw text straight from
 * `examples/seed-plan-packet.v0.1.json` — the canonical repository fixture — so
 * its content is never hand-copied into application logic. Consumers feed this
 * string through the same validation path as any pasted or selected packet.
 */
import seedJsonRaw from '../../examples/seed-plan-packet.v0.1.json?raw';

export const SEED_PACKET_JSON: string = seedJsonRaw;
