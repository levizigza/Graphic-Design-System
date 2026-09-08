import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Structured production error — correlation-safe, no secrets.
 */
export const StructuredErrorStateSchema = z
  .object({
    failed: z.literal(true),
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    retryable: z.boolean(),
    occurredAt: IsoDateTimeSchema,
    correlationId: NonEmptyStringSchema.optional(),
    requestId: NonEmptyStringSchema.optional(),
    jobId: NonEmptyStringSchema.optional(),
    /** Redacted context only — never tokens. */
    details: z.record(z.unknown()).optional(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type StructuredErrorState = z.infer<typeof StructuredErrorStateSchema>;

export const OkStructuredStateSchema = z
  .object({
    failed: z.literal(false),
  })
  .strict();

export const WorkflowErrorStateSchema = z.union([
  OkStructuredStateSchema,
  StructuredErrorStateSchema,
]);

export type WorkflowErrorState = z.infer<typeof WorkflowErrorStateSchema>;

export function okWorkflowErrorState(): WorkflowErrorState {
  return { failed: false };
}

export const AuditEventKindSchema = z.enum([
  "job_created",
  "phase_transition",
  "capability_probe",
  "capability_cache_hit",
  "capability_cache_miss",
  "mcp_request",
  "mcp_response",
  "mcp_error",
  "rate_limit_wait",
  "retry",
  "idempotent_replay",
  "export_poll",
  "artifact_versioned",
  "secret_access_denied_log",
  "other",
]);

export type AuditEventKind = z.infer<typeof AuditEventKindSchema>;

export const AuditEventSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: AuditEventKindSchema,
  jobId: NonEmptyStringSchema.optional(),
  correlationId: NonEmptyStringSchema,
  requestId: NonEmptyStringSchema.optional(),
  /** Documented or live tool name — never includes auth headers. */
  toolName: NonEmptyStringSchema.optional(),
  phase: NonEmptyStringSchema.optional(),
  outcome: z.enum(["ok", "error", "skipped", "pending"]).default("ok"),
  /** Already-redacted payload. */
  payload: z.record(z.unknown()).default({}),
  message: NonEmptyStringSchema,
})
  .strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;
