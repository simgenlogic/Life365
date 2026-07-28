import { describe, expect, it } from 'vitest';
import { selectCarryForward, type CarryForwardInput } from './carryForward';
import type { ItemState, PlanItem } from './planPacket';

interface Options {
  state?: ItemState;
  visible?: boolean;
  carryForward?: boolean;
  order?: number;
  retired?: boolean;
  scopeId?: string;
}

function item(itemId: string, opts: Options = {}): CarryForwardInput {
  const definition: PlanItem = {
    item_id: itemId,
    label: `Label ${itemId}`,
    state: opts.state ?? 'active',
    summary: `Summary ${itemId}`,
    tags: [],
    dashboard: {
      visible: opts.visible ?? true,
      order: opts.order ?? 10,
      show_last_record_age: true,
    },
    continuity: {
      carry_forward: opts.carryForward ?? true,
      quiet_after_days: 3,
    },
  };
  return {
    scopeId: opts.scopeId ?? 'core-plan',
    itemId,
    retired: opts.retired ?? false,
    definition,
  };
}

describe('selectCarryForward — filtering', () => {
  it('includes only active, visible, carry-forward, non-retired items', () => {
    const items = [
      item('keep'),
      item('paused', { state: 'paused' }),
      item('closed', { state: 'closed' }),
      item('hidden', { visible: false }),
      item('no-carry', { carryForward: false }),
      item('retired', { retired: true }),
    ];

    const result = selectCarryForward(items).map((i) => i.itemId);
    expect(result).toEqual(['keep']);
  });

  it('does not mutate the input array', () => {
    const items = [item('b', { order: 20 }), item('a', { order: 10 })];
    const before = items.map((i) => i.itemId);
    selectCarryForward(items);
    expect(items.map((i) => i.itemId)).toEqual(before);
  });
});

describe('selectCarryForward — deterministic ordering', () => {
  it('orders by dashboard.order then item id then scope id', () => {
    const items = [
      item('later', { order: 30 }),
      item('mid-b', { order: 20 }),
      item('mid-a', { order: 20 }),
      item('first', { order: 10 }),
    ];

    const result = selectCarryForward(items).map((i) => i.itemId);
    expect(result).toEqual(['first', 'mid-a', 'mid-b', 'later']);
  });

  it('breaks equal order and equal id ties by scope id', () => {
    const items = [
      item('shared', { order: 10, scopeId: 'z-scope' }),
      item('shared', { order: 10, scopeId: 'a-scope' }),
    ];

    const result = selectCarryForward(items).map((i) => i.scopeId);
    expect(result).toEqual(['a-scope', 'z-scope']);
  });
});
