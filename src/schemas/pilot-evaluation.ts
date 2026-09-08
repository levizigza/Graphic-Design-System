import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  UrlSchema,
} from "./common.js";
import { ApprovalRecordSchema } from "./approval-record.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Provenance for Canva handoff artifacts in a pilot.
 * Live MCP is required before final design approval — harness mocks are evaluation-only.
 */
export const CanvaProvenanceSourceSchema = z.enum([
  "live_design_mcp",
  "pilot_harness_mock",
  "unavailable",
]);

export type CanvaProvenanceSource = z.infer<typeof CanvaProvenanceSourceSchema>;

export const CanvaProvenanceSchema = z
  .object({
    source: CanvaProvenanceSourceSchema,
    discoveredToolCount: z.number().int().nonnegative(),
    note: NonEmptyStringSchema,
    recordedAt: IsoDateTimeSchema,
  })
  .strict();

export type CanvaProvenance = z.infer<typeof CanvaProvenanceSchema>;

export const PilotHumanReviewNotesSchema = z
  .object({
    reviewer: NonEmptyStringSchema,
    reviewedAt: IsoDateTimeSchema,
    twoSecondImpression: NonEmptyStringSchema,
    messageRecall: NonEmptyStringSchema,
    brandRecognition: NonEmptyStringSchema,
    ctaComprehension: NonEmptyStringSchema,
    productionDefectsNoted: z.array(NonEmptyStringSchema).default([]),
    overallNotes: z.array(NonEmptyStringSchema).default([]),
    recommendApproval: z.boolean(),
  })
  .strict();

export type PilotHumanReviewNotes = z.infer<typeof PilotHumanReviewNotesSchema>;

export const PilotMetricScoresSchema = z
  .object({
    comprehension: z.number().min(0).max(10),
    recall: z.number().min(0).max(10),
    brandRecognition: z.number().min(0).max(10),
    ctaClarity: z.number().min(0).max(10),
    productionDefects: z.number().int().min(0),
    revisionCount: z.number().int().min(0),
    /** Wall-clock minutes from brief lock to approval decision (or block). */
    timeToApprovedOutputMinutes: z.number().nonnegative(),
  })
  .strict();

export type PilotMetricScores = z.infer<typeof PilotMetricScoresSchema>;

export const BaselineDesignRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    formatId: z.enum(["poster", "business_card"]),
    label: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    scores: PilotMetricScoresSchema,
    sourceNote: NonEmptyStringSchema,
  })
  .strict();

export type BaselineDesignRecord = z.infer<typeof BaselineDesignRecordSchema>;

export const PilotComparisonDeltaSchema = z
  .object({
    metric: z.enum([
      "comprehension",
      "recall",
      "brandRecognition",
      "ctaClarity",
      "productionDefects",
      "revisionCount",
      "timeToApprovedOutputMinutes",
    ]),
    baseline: z.number(),
    system: z.number(),
    /** Positive = system better for quality metrics; for defects/revisions/time, lower is better. */
    delta: z.number(),
    lowerIsBetter: z.boolean(),
    systemWins: z.boolean(),
  })
  .strict();

export type PilotComparisonDelta = z.infer<typeof PilotComparisonDeltaSchema>;

export const PilotFormatPackageSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  formatId: z.enum(["poster", "business_card"]),
  jobId: NonEmptyStringSchema,
  correlationId: NonEmptyStringSchema,
  designVersion: NonEmptyStringSchema,
  briefId: NonEmptyStringSchema,
  brandId: NonEmptyStringSchema,
  conceptBoardId: NonEmptyStringSchema,
  selectedConceptIds: z.array(NonEmptyStringSchema).length(2),
  visuallyDevelopedConceptId: NonEmptyStringSchema,
  designSpecId: NonEmptyStringSchema,
  canvaProvenance: CanvaProvenanceSchema,
  designId: NonEmptyStringSchema.nullable(),
  editUrl: z.union([UrlSchema, z.null()]),
  preflightReportId: NonEmptyStringSchema,
  critiqueRecordId: NonEmptyStringSchema,
  exportJobId: NonEmptyStringSchema.nullable(),
  exportDownloadUrl: z.union([UrlSchema, z.null()]),
  exportProofed: z.boolean(),
  humanReviewNotes: PilotHumanReviewNotesSchema,
  finalApproval: ApprovalRecordSchema,
  systemScores: PilotMetricScoresSchema,
  baseline: BaselineDesignRecordSchema,
  comparison: z.array(PilotComparisonDeltaSchema).min(1),
  artifactPaths: z.record(NonEmptyStringSchema).default({}),
})
  .strict()
  .superRefine((pkg, ctx) => {
    if (
      pkg.finalApproval.status === "approved" &&
      pkg.canvaProvenance.source !== "live_design_mcp"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Final design approval requires live_design_mcp provenance — harness mocks cannot approve production designs",
        path: ["finalApproval", "status"],
      });
    }
    if (
      pkg.finalApproval.status === "approved" &&
      (!pkg.designId || !pkg.editUrl || !pkg.exportProofed)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Approved pilot packages require designId, editUrl, and proofed export",
        path: ["finalApproval"],
      });
    }
  });

export type PilotFormatPackage = z.infer<typeof PilotFormatPackageSchema>;

export const PilotFailureSeveritySchema = z.enum([
  "blocker",
  "major",
  "minor",
  "observation",
]);

export const PilotFailureRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    occurredAt: IsoDateTimeSchema,
    formatId: z.enum(["poster", "business_card", "shared"]).optional(),
    stage: NonEmptyStringSchema,
    severity: PilotFailureSeveritySchema,
    summary: NonEmptyStringSchema,
    detail: NonEmptyStringSchema,
    recurring: z.boolean().default(false),
    /** Converted remediation when recurring or blocker. */
    convertedInto: z
      .object({
        kind: z.enum(["validation_rule", "schema_field", "workflow_step"]),
        reference: NonEmptyStringSchema,
        description: NonEmptyStringSchema,
      })
      .optional(),
  })
  .strict();

export type PilotFailureRecord = z.infer<typeof PilotFailureRecordSchema>;

export const PilotEvaluationReportSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  pilotId: NonEmptyStringSchema,
  correlationId: NonEmptyStringSchema,
  organizationName: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  packages: z.array(PilotFormatPackageSchema).length(2),
  failures: z.array(PilotFailureRecordSchema).default([]),
  /** Explicit: do not spawn more agents unless a measurable coordinator bottleneck is recorded. */
  agentExpansionRecommendation: z
    .object({
      addAgents: z.literal(false),
      rationale: NonEmptyStringSchema,
      measuredBottleneck: NonEmptyStringSchema.nullable(),
    })
    .strict(),
  overallStatus: z.enum([
    "complete_approved",
    "complete_blocked_pending_live_canva",
    "incomplete",
  ]),
})
  .strict()
  .superRefine((report, ctx) => {
    const formats = new Set(report.packages.map((p) => p.formatId));
    if (!formats.has("poster") || !formats.has("business_card")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pilot must include exactly one poster and one business_card package",
        path: ["packages"],
      });
    }
  });

export type PilotEvaluationReport = z.infer<typeof PilotEvaluationReportSchema>;
