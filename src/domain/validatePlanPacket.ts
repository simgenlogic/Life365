/**
 * Pure validation entrypoint for imported Plan Packets.
 *
 * This module never touches persistent or application state. It only parses and
 * validates, returning a discriminated result. This is the single path every
 * import (pasted text, selected file, or the dev seed fixture) flows through,
 * satisfying the invariant "validate imports before mutating persistent state".
 */

import type { PlanPacket, PlanPacketCounts } from './planPacket';
import { summarizePlanPacketCounts } from './planPacket';
import { planPacketSchema } from './planPacketSchema';

export interface ValidationIssue {
  /** Dotted path to the offending field, or '(root)' when top-level. */
  path: string;
  message: string;
}

export type ValidationErrorStage = 'json' | 'schema';

export type PlanPacketValidationResult =
  | {
      ok: true;
      packet: PlanPacket;
      counts: PlanPacketCounts;
    }
  | {
      ok: false;
      stage: ValidationErrorStage;
      issues: ValidationIssue[];
    };

/**
 * Validate an already-parsed value against the Plan Packet schema.
 *
 * Does not mutate the input or any external state.
 */
export function validatePlanPacketValue(
  value: unknown,
): PlanPacketValidationResult {
  const parsed = planPacketSchema.safeParse(value);
  if (parsed.success) {
    const packet = parsed.data as PlanPacket;
    return {
      ok: true,
      packet,
      counts: summarizePlanPacketCounts(packet),
    };
  }

  const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));

  return { ok: false, stage: 'schema', issues };
}

/**
 * Validate raw JSON text: parse first, then schema-validate.
 *
 * Malformed JSON is reported at the 'json' stage; a structurally valid document
 * that violates the contract is reported at the 'schema' stage. Either way, no
 * state is changed.
 */
export function validatePlanPacketJson(
  jsonText: string,
): PlanPacketValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid JSON syntax';
    return {
      ok: false,
      stage: 'json',
      issues: [{ path: '(root)', message }],
    };
  }
  return validatePlanPacketValue(value);
}
