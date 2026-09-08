import { z } from "zod";
import {
  DocumentMetaSchema,
  FailureStateSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  UrlSchema,
  okFailureState,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

export const CanvaCapabilityKindSchema = z.enum([
  "generation",
  "editing",
  "export",
  "resize",
  "templates",
  "autofill",
]);

export type CanvaCapabilityKind = z.infer<typeof CanvaCapabilityKindSchema>;

export const CanvaCapabilityStatusSchema = z.enum([
  "available",
  "missing_tool",
  "plan_restricted",
  "unauthenticated",
  "unknown",
  "error",
]);

export type CanvaCapabilityStatus = z.infer<typeof CanvaCapabilityStatusSchema>;

export const CanvaToolDescriptorSchema = z
  .object({
    name: NonEmptyStringSchema,
    namespace: NonEmptyStringSchema.optional(),
    description: z.string().optional(),
    live: z.boolean().default(true),
  })
  .strict();

export type CanvaToolDescriptor = z.infer<typeof CanvaToolDescriptorSchema>;

export const CanvaToolDiscoveryLogSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  discoveredAt: IsoDateTimeSchema,
  source: z.enum(["mcp_list_tools", "injected_catalog", "empty"]),
  tools: z.array(CanvaToolDescriptorSchema),
  normalizedNames: z.array(NonEmptyStringSchema),
  notes: z.array(NonEmptyStringSchema).default([]),
})
  .strict();

export type CanvaToolDiscoveryLog = z.infer<typeof CanvaToolDiscoveryLogSchema>;

export const CanvaCapabilityProbeSchema = z
  .object({
    kind: CanvaCapabilityKindSchema,
    status: CanvaCapabilityStatusSchema,
    requiredTools: z.array(NonEmptyStringSchema),
    presentTools: z.array(NonEmptyStringSchema),
    detail: NonEmptyStringSchema.optional(),
    planHint: NonEmptyStringSchema.optional(),
  })
  .strict();

export type CanvaCapabilityProbe = z.infer<typeof CanvaCapabilityProbeSchema>;

export const CanvaToolRateLimitSchema = z
  .object({
    toolName: NonEmptyStringSchema,
    requestsPerMinute: z.number().positive(),
    source: z.enum([
      "documented_default",
      "capability_response",
      "config_override",
    ]),
  })
  .strict();

export type CanvaToolRateLimit = z.infer<typeof CanvaToolRateLimitSchema>;

export const CanvaAccountCapabilityReportSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  discoveryLogId: NonEmptyStringSchema,
  probedAt: IsoDateTimeSchema,
  probes: z.array(CanvaCapabilityProbeSchema).min(1),
  generationReady: z.boolean(),
  editingReady: z.boolean(),
  exportReady: z.boolean(),
  resizeReady: z.boolean(),
  templatesReady: z.boolean(),
  autofillReady: z.boolean(),
  blockingIssues: z.array(NonEmptyStringSchema).default([]),
  /**
   * Effective per-tool limits for this session.
   * Defaults come from documented Canva MCP rates; live capability responses may override.
   */
  toolRateLimits: z.array(CanvaToolRateLimitSchema).default([]),
  /** Suggested export polling defaults derived from limits / config. */
  exportPoll: z
    .object({
      maxPolls: z.number().int().positive().default(20),
      pollIntervalMs: z.number().int().positive().default(1500),
    })
    .strict()
    .optional(),
  cacheExpiresAt: IsoDateTimeSchema.optional(),
})
  .strict();

export type CanvaAccountCapabilityReport = z.infer<
  typeof CanvaAccountCapabilityReportSchema
>;

/**
 * A generated candidate — not yet an editable design.
 * Never auto-select; user must pick explicitly.
 */
export const DesignCandidateSchema = z
  .object({
    candidateId: NonEmptyStringSchema,
    thumbnailUrl: UrlSchema.optional(),
    previewNotes: z.array(NonEmptyStringSchema).default([]),
    rationale: NonEmptyStringSchema,
    viable: z.boolean(),
    nonViableReason: NonEmptyStringSchema.optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.viable && !c.nonViableReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nonViableReason required when viable is false",
        path: ["nonViableReason"],
      });
    }
  });

export type DesignCandidate = z.infer<typeof DesignCandidateSchema>;

export const CandidatePresentationSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  designSpecId: NonEmptyStringSchema,
  candidates: z.array(DesignCandidateSchema).min(1),
  selectionRequired: z.literal(true).default(true),
  selectedCandidateId: NonEmptyStringSchema.nullable().default(null),
  selectionPrompt: z
    .literal(
      "Select one candidate explicitly before any editing transaction. The adapter will not choose for you.",
    )
    .default(
      "Select one candidate explicitly before any editing transaction. The adapter will not choose for you.",
    ),
})
  .strict()
  .superRefine((pres, ctx) => {
    if (pres.selectedCandidateId) {
      const found = pres.candidates.some(
        (c) => c.candidateId === pres.selectedCandidateId && c.viable,
      );
      if (!found) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "selectedCandidateId must reference a viable candidate on this presentation",
          path: ["selectedCandidateId"],
        });
      }
    }
  });

export type CandidatePresentation = z.infer<typeof CandidatePresentationSchema>;

/** Element IDs are only valid inside an open editing transaction. */
export const EditableElementRefSchema = z
  .object({
    elementId: NonEmptyStringSchema,
    kind: z.enum(["richtext", "fill", "other"]),
    pageIndex: z.number().int().positive().optional(),
    editable: z.boolean().default(true),
    previewText: NonEmptyStringSchema.optional(),
    assetId: NonEmptyStringSchema.optional(),
  })
  .strict();

export type EditableElementRef = z.infer<typeof EditableElementRefSchema>;

export const EditingTransactionStateSchema = z
  .object({
    transactionId: NonEmptyStringSchema,
    designId: NonEmptyStringSchema,
    editDesignUrl: UrlSchema,
    status: z.enum(["open", "committed", "cancelled"]),
    /** ONLY ids returned by start/perform editing tools — never from get-design-content. */
    editableElements: z.array(EditableElementRefSchema).default([]),
    pageIds: z.array(NonEmptyStringSchema).default([]),
    openedAt: IsoDateTimeSchema,
    committedAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export type EditingTransactionState = z.infer<typeof EditingTransactionStateSchema>;

export const CanvaAdapterPhaseSchema = z.enum([
  "init",
  "discovered",
  "capabilities_validated",
  "candidates_ready",
  "awaiting_candidate_selection",
  "candidate_selected",
  "design_created",
  "editing_open",
  "edits_applied",
  "committed",
  "handoff_ready",
  "export_offered",
  "exporting",
  "exported",
  "failed",
]);

export type CanvaAdapterPhase = z.infer<typeof CanvaAdapterPhaseSchema>;

export const CanvaAdapterSessionSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  designSpecId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema.nullable().default(null),
  correlationId: NonEmptyStringSchema.nullable().default(null),
  lastRequestId: NonEmptyStringSchema.nullable().default(null),
  phase: CanvaAdapterPhaseSchema,
  discoveryLogId: NonEmptyStringSchema.nullable().default(null),
  capabilityReportId: NonEmptyStringSchema.nullable().default(null),
  presentationId: NonEmptyStringSchema.nullable().default(null),
  selectedCandidateId: NonEmptyStringSchema.nullable().default(null),
  designId: NonEmptyStringSchema.nullable().default(null),
  editUrl: z.union([UrlSchema, z.null()]).default(null),
  transaction: EditingTransactionStateSchema.nullable().default(null),
  exportJobId: NonEmptyStringSchema.nullable().default(null),
  exportFormat: NonEmptyStringSchema.nullable().default(null),
  toolsUsed: z.array(NonEmptyStringSchema).default([]),
  idempotencyKeys: z.array(NonEmptyStringSchema).default([]),
  failureState: FailureStateSchema.default(okFailureState()),
  log: z.array(NonEmptyStringSchema).default([]),
})
  .strict()
  .superRefine((s, ctx) => {
    if (s.phase === "handoff_ready" || s.phase === "export_offered" || s.phase === "exported") {
      if (!s.designId || !s.editUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "handoff/export phases require designId and editUrl before export",
          path: ["designId"],
        });
      }
    }
    if (
      (s.phase === "editing_open" ||
        s.phase === "edits_applied" ||
        s.phase === "committed") &&
      !s.transaction
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "editing phases require an open/known transaction",
        path: ["transaction"],
      });
    }
  });

export type CanvaAdapterSession = z.infer<typeof CanvaAdapterSessionSchema>;
