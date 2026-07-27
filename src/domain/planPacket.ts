/**
 * Typed domain model for the LIFE365 Plan Packet v0.1 contract.
 *
 * These types mirror `schemas/life365-plan-packet-v0.1.schema.json` and the
 * envelope described in PROJECT_SPEC.md §5. They describe the shape of a packet
 * *after* it has passed runtime validation; nothing here executes packet data.
 *
 * Scope note (Packet 0001A): this file is the domain-model portion only.
 * Packet installation, opportunity generation, recording, and context
 * compilation are intentionally not implemented in this milestone.
 */

export const PLAN_PACKET_SCHEMA_ID = 'life365.plan/v0.1' as const;

export type ItemState = 'active' | 'paused' | 'closed';

export type FieldType =
  | 'single_choice'
  | 'multi_choice'
  | 'boolean'
  | 'integer'
  | 'decimal'
  | 'scale'
  | 'short_text'
  | 'long_text'
  | 'duration_minutes'
  | 'time'
  | 'date';

export type AvailabilityType = 'manual' | 'once' | 'daily' | 'days_of_week';

export type OutputSectionType =
  | 'active_items'
  | 'recent_records'
  | 'quiet_items'
  | 'unresolved_opportunities'
  | 'evidence_coverage'
  | 'user_request';

export interface DashboardConfig {
  visible: boolean;
  order: number;
  show_last_record_age: boolean;
}

export interface ContinuityConfig {
  carry_forward: boolean;
  quiet_after_days: number;
}

export interface PlanItem {
  item_id: string;
  label: string;
  state: ItemState;
  summary: string;
  tags: string[];
  dashboard: DashboardConfig;
  continuity: ContinuityConfig;
}

export interface FieldOption {
  value: string | number | boolean;
  label: string;
}

export interface PromptField {
  type: FieldType;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface Availability {
  type: AvailabilityType;
  local_time?: string;
  date?: string;
  days?: number[];
  start_date: string;
  end_date: string | null;
}

export interface Capture {
  tier: number;
  allow_backfill: boolean;
  recovery_days: number;
  allow_unknown: boolean;
  allow_not_applicable: boolean;
  allow_defer: boolean;
}

export interface FollowupField {
  id: string;
  label: string;
  type: FieldType;
  optional: boolean;
  options?: FieldOption[];
  min?: number;
  max?: number;
}

export interface Followup {
  when: {
    field: 'primary';
    equals: string | number | boolean;
  };
  field: FollowupField;
}

export interface Prompt {
  prompt_id: string;
  item_id?: string;
  label: string;
  help_text: string;
  field: PromptField;
  availability: Availability;
  capture: Capture;
  followups: Followup[];
}

export interface OutputSection {
  type: OutputSectionType;
  days?: number;
}

export interface OutputRecipe {
  recipe_id: string;
  title: string;
  sections: OutputSection[];
}

export interface ItemChanges {
  upsert: PlanItem[];
  retire: string[];
}

export interface PromptChanges {
  upsert: Prompt[];
  retire: string[];
}

export interface RecipeChanges {
  upsert: OutputRecipe[];
  retire: string[];
}

export interface PlanPacketChanges {
  items: ItemChanges;
  prompts: PromptChanges;
  output_recipes: RecipeChanges;
}

export interface PlanPacket {
  schema: typeof PLAN_PACKET_SCHEMA_ID;
  packet_id: string;
  scope_id: string;
  revision: number;
  created_at: string;
  title: string;
  summary: string;
  changes: PlanPacketChanges;
}

/** Human-readable counts derived from a validated packet, for preview UIs. */
export interface PlanPacketCounts {
  itemsUpsert: number;
  itemsRetire: number;
  promptsUpsert: number;
  promptsRetire: number;
  recipesUpsert: number;
  recipesRetire: number;
}

export function summarizePlanPacketCounts(packet: PlanPacket): PlanPacketCounts {
  return {
    itemsUpsert: packet.changes.items.upsert.length,
    itemsRetire: packet.changes.items.retire.length,
    promptsUpsert: packet.changes.prompts.upsert.length,
    promptsRetire: packet.changes.prompts.retire.length,
    recipesUpsert: packet.changes.output_recipes.upsert.length,
    recipesRetire: packet.changes.output_recipes.retire.length,
  };
}
