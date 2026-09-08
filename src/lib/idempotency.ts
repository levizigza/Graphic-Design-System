import type { CanvaAdapterPhase } from "../schemas/canva-session.js";

/**
 * Allowed forward transitions for Canva adapter sessions.
 * Same-phase re-entry with matching idempotency key is a no-op (handled separately).
 */
export const ALLOWED_PHASE_TRANSITIONS: Readonly<
  Record<CanvaAdapterPhase, readonly CanvaAdapterPhase[]>
> = {
  init: ["discovered", "failed"],
  discovered: ["capabilities_validated", "failed"],
  capabilities_validated: ["candidates_ready", "awaiting_candidate_selection", "failed"],
  candidates_ready: ["awaiting_candidate_selection", "failed"],
  awaiting_candidate_selection: ["candidate_selected", "failed"],
  candidate_selected: ["design_created", "failed"],
  design_created: ["editing_open", "handoff_ready", "failed"],
  editing_open: ["edits_applied", "committed", "failed"],
  edits_applied: ["edits_applied", "committed", "failed"],
  committed: ["handoff_ready", "failed"],
  handoff_ready: ["export_offered", "exporting", "failed"],
  export_offered: ["exporting", "failed"],
  exporting: ["exported", "exporting", "failed"],
  exported: ["exported", "failed"],
  failed: ["failed"],
};

export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict" as const;
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class IllegalPhaseTransitionError extends Error {
  readonly code = "illegal_phase_transition" as const;
  constructor(
    readonly from: CanvaAdapterPhase,
    readonly to: CanvaAdapterPhase,
  ) {
    super(`Illegal phase transition: ${from} → ${to}`);
    this.name = "IllegalPhaseTransitionError";
  }
}

export function assertPhaseTransition(
  from: CanvaAdapterPhase,
  to: CanvaAdapterPhase,
): void {
  if (from === to) return;
  const allowed = ALLOWED_PHASE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new IllegalPhaseTransitionError(from, to);
  }
}

export type IdempotentRecord<T> = {
  key: string;
  operation: string;
  result: T;
  createdAt: string;
};

/**
 * In-memory idempotency store: same key + operation returns prior result;
 * same key + different operation fails closed.
 */
export class IdempotencyStore {
  private readonly records = new Map<string, IdempotentRecord<unknown>>();

  remember<T>(
    key: string,
    operation: string,
    result: T,
    createdAt: string,
  ): T {
    const existing = this.records.get(key);
    if (existing) {
      if (existing.operation !== operation) {
        throw new IdempotencyConflictError(
          `Idempotency key ${key} already used for operation ${existing.operation}`,
        );
      }
      return existing.result as T;
    }
    this.records.set(key, { key, operation, result, createdAt });
    return result;
  }

  get<T>(key: string, operation: string): T | undefined {
    const existing = this.records.get(key);
    if (!existing) return undefined;
    if (existing.operation !== operation) {
      throw new IdempotencyConflictError(
        `Idempotency key ${key} already used for operation ${existing.operation}`,
      );
    }
    return existing.result as T;
  }

  has(key: string): boolean {
    return this.records.has(key);
  }
}
