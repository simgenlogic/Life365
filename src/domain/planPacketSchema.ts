/**
 * Runtime validation schema for LIFE365 Plan Packet v0.1.
 *
 * This is a faithful Zod translation of
 * `schemas/life365-plan-packet-v0.1.schema.json`. It is the single runtime
 * gate for imported packets (PROJECT_SPEC.md §10: "Runtime packet validation
 * through Zod or JSON Schema validation").
 *
 * `.strict()` mirrors `additionalProperties: false` so packets carrying
 * unknown fields are rejected rather than silently accepted.
 */

import { z } from 'zod';
import { PLAN_PACKET_SCHEMA_ID } from './planPacket';

// #/$defs/id — stable identifier pattern.
const idSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'must be a stable id');

// ISO date (YYYY-MM-DD), matching JSON Schema "format": "date".
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

const fieldTypeSchema = z.enum([
  'single_choice',
  'multi_choice',
  'boolean',
  'integer',
  'decimal',
  'scale',
  'short_text',
  'long_text',
  'duration_minutes',
  'time',
  'date',
]);

const optionSchema = z
  .object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string().min(1).max(120),
  })
  .strict();

const dashboardSchema = z
  .object({
    visible: z.boolean(),
    order: z.number().int().min(0).max(100000),
    show_last_record_age: z.boolean(),
  })
  .strict();

const continuitySchema = z
  .object({
    carry_forward: z.boolean(),
    quiet_after_days: z.number().int().min(0).max(3650),
  })
  .strict();

const itemSchema = z
  .object({
    item_id: idSchema,
    label: z.string().min(1).max(120),
    state: z.enum(['active', 'paused', 'closed']),
    summary: z.string().max(2000),
    tags: z.array(z.string().min(1).max(60)),
    dashboard: dashboardSchema,
    continuity: continuitySchema,
  })
  .strict();

const fieldSchema = z
  .object({
    type: fieldTypeSchema,
    options: z.array(optionSchema).min(1).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().gt(0).optional(),
  })
  .strict();

const availabilitySchema = z
  .object({
    type: z.enum(['manual', 'once', 'daily', 'days_of_week']),
    local_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm')
      .optional(),
    date: dateStringSchema.optional(),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((d) => new Set(d).size === d.length, 'days must be unique')
      .optional(),
    start_date: dateStringSchema,
    end_date: dateStringSchema.nullable(),
  })
  .strict();

const captureSchema = z
  .object({
    tier: z.number().int().min(1).max(3),
    allow_backfill: z.boolean(),
    recovery_days: z.number().int().min(0).max(365),
    allow_unknown: z.boolean(),
    allow_not_applicable: z.boolean(),
    allow_defer: z.boolean(),
  })
  .strict();

const followupSchema = z
  .object({
    when: z
      .object({
        field: z.literal('primary'),
        equals: z.union([z.string(), z.number(), z.boolean()]),
      })
      .strict(),
    field: z
      .object({
        id: idSchema,
        label: z.string().min(1).max(240),
        type: fieldTypeSchema,
        optional: z.boolean(),
        options: z.array(optionSchema).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .strict(),
  })
  .strict();

const promptSchema = z
  .object({
    prompt_id: idSchema,
    item_id: idSchema.optional(),
    label: z.string().min(1).max(240),
    help_text: z.string().max(1000),
    field: fieldSchema,
    availability: availabilitySchema,
    capture: captureSchema,
    followups: z.array(followupSchema),
  })
  .strict();

const outputSectionSchema = z
  .object({
    type: z.enum([
      'active_items',
      'recent_records',
      'quiet_items',
      'unresolved_opportunities',
      'evidence_coverage',
      'user_request',
    ]),
    days: z.number().int().min(1).max(3650).optional(),
  })
  .strict();

const outputRecipeSchema = z
  .object({
    recipe_id: idSchema,
    title: z.string().min(1).max(160),
    sections: z.array(outputSectionSchema).min(1),
  })
  .strict();

const retireListSchema = z
  .array(idSchema)
  .refine((v) => new Set(v).size === v.length, 'retire ids must be unique');

const changesSchema = z
  .object({
    items: z
      .object({ upsert: z.array(itemSchema), retire: retireListSchema })
      .strict(),
    prompts: z
      .object({ upsert: z.array(promptSchema), retire: retireListSchema })
      .strict(),
    output_recipes: z
      .object({ upsert: z.array(outputRecipeSchema), retire: retireListSchema })
      .strict(),
  })
  .strict();

/**
 * The complete Plan Packet schema. Parsing with this validates a packet against
 * the v0.1 contract without touching any application state.
 */
export const planPacketSchema = z
  .object({
    schema: z.literal(PLAN_PACKET_SCHEMA_ID),
    packet_id: idSchema,
    scope_id: idSchema,
    revision: z.number().int().min(1),
    created_at: z.string().datetime({ offset: true }),
    title: z.string().min(1).max(160),
    summary: z.string().max(2000),
    changes: changesSchema,
  })
  .strict();
