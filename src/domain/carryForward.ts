/**
 * Deterministic Dashboard Carry Forward selection (Packet 0001B §5).
 *
 * A pure function over installed items. It encodes the selection and ordering
 * rules so React components never do: an item appears under Carry Forward only
 * when it is not retired, its state is `active`, it is dashboard-visible, and it
 * is configured to carry forward. Paused, closed, retired, hidden, and
 * non-carry-forward items are excluded but remain in stored history.
 */

import type { PlanItem } from './planPacket';

/** Minimal shape Carry Forward needs from a stored item row. */
export interface CarryForwardInput {
  scopeId: string;
  itemId: string;
  retired: boolean;
  definition: PlanItem;
}

/**
 * Filter and order items for the Dashboard Carry Forward section.
 *
 * Ordering is deterministic: `dashboard.order` ascending, then the stable item
 * identifier ascending, then scope id, so two scopes sharing an item id and
 * order still resolve to a fixed sequence.
 */
export function selectCarryForward<T extends CarryForwardInput>(
  items: T[],
): T[] {
  return items
    .filter(
      (item) =>
        !item.retired &&
        item.definition.state === 'active' &&
        item.definition.dashboard.visible &&
        item.definition.continuity.carry_forward,
    )
    .slice()
    .sort((a, b) => {
      const orderDelta = a.definition.dashboard.order - b.definition.dashboard.order;
      if (orderDelta !== 0) return orderDelta;
      if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;
      if (a.scopeId !== b.scopeId) return a.scopeId < b.scopeId ? -1 : 1;
      return 0;
    });
}
