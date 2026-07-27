import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validatePlanPacketJson,
  validatePlanPacketValue,
} from './validatePlanPacket';

// Read the real seed fixture from the repository rather than inlining its
// content, so the test proves the shipped example validates through the same
// path the app uses.
const seedPath = fileURLToPath(
  new URL('../../examples/seed-plan-packet.v0.1.json', import.meta.url),
);
const seedJson = readFileSync(seedPath, 'utf-8');

describe('validatePlanPacketJson', () => {
  it('accepts the seed Plan Packet', () => {
    const result = validatePlanPacketJson(seedJson);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.packet.packet_id).toBe('seed-2026-07-26-r1');
    expect(result.packet.scope_id).toBe('core-plan');
    expect(result.counts).toEqual({
      itemsUpsert: 3,
      itemsRetire: 0,
      promptsUpsert: 2,
      promptsRetire: 0,
      recipesUpsert: 1,
      recipesRetire: 0,
    });
  });

  it('rejects malformed JSON at the json stage', () => {
    const result = validatePlanPacketJson('{ not valid json ');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('json');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects a schema-invalid packet at the schema stage', () => {
    // Structurally valid JSON, but the wrong schema constant and a missing
    // required "changes" block.
    const badPacket = JSON.stringify({
      schema: 'life365.plan/v0.2',
      packet_id: 'x',
      scope_id: 'y',
      revision: 1,
      created_at: '2026-07-26T14:00:00-04:00',
      title: 'Bad',
      summary: '',
    });

    const result = validatePlanPacketJson(badPacket);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('schema');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects a packet carrying unknown fields (strict envelope)', () => {
    const withExtra = JSON.parse(seedJson) as Record<string, unknown>;
    withExtra.unexpected_field = true;

    const result = validatePlanPacketValue(withExtra);
    expect(result.ok).toBe(false);
  });

  it('rejects a revision below the minimum', () => {
    const bad = JSON.parse(seedJson) as Record<string, unknown>;
    bad.revision = 0;

    const result = validatePlanPacketValue(bad);
    expect(result.ok).toBe(false);
  });
});

describe('validation does not mutate application state', () => {
  it('leaves the input value unchanged after validation', () => {
    const input = JSON.parse(seedJson);
    const before = JSON.stringify(input);

    validatePlanPacketValue(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it('does not mutate a deeply frozen input', () => {
    const input = deepFreeze(JSON.parse(seedJson));

    // Validation must succeed without attempting any write to the frozen input.
    expect(() => validatePlanPacketValue(input)).not.toThrow();
    const result = validatePlanPacketValue(input);
    expect(result.ok).toBe(true);
  });

  it('produces independent results across repeated calls (no shared state)', () => {
    const a = validatePlanPacketJson(seedJson);
    const b = validatePlanPacketJson(seedJson);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Distinct object graphs — no accumulation in module-level state.
    expect(a.packet).not.toBe(b.packet);
    expect(a.packet).toEqual(b.packet);
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
