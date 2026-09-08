import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  UrlSchema,
} from "./common.js";
import { WorkflowErrorStateSchema, okWorkflowErrorState } from "./structured-error.js";
import { SCHEMA_VERSION } from "./version.js";

export const VersionedArtifactKindSchema = z.enum([
  "brief",
  "concept",
  "concept_board",
  "design_spec",
  "critique",
  "export",
  "preflight",
  "asset_manifest",
  "render_result",
  "other",
]);

export type VersionedArtifactKind = z.infer<typeof VersionedArtifactKindSchema>;

/** One immutable version of a workflow artifact. */
export const VersionedArtifactRefSchema = z
  .object({
    kind: VersionedArtifactKindSchema,
    artifactId: NonEmptyStringSchema,
    version: NonEmptyStringSchema.describe("e.g. v1, v2"),
    relativePath: NonEmptyStringSchema,
    sha256: Sha256Schema.optional(),
    createdAt: IsoDateTimeSchema,
    correlationId: NonEmptyStringSchema.optional(),
    notes: z.array(NonEmptyStringSchema).default([]),
  })
  .strict();

export type VersionedArtifactRef = z.infer<typeof VersionedArtifactRefSchema>;

export const JobPhaseSchema = z.enum([
  "intake",
  "concepts",
  "production",
  "preflight",
  "critique",
  "exporting",
  "archived",
  "failed",
]);

export type JobPhase = z.infer<typeof JobPhaseSchema>;

export const JobHistoryEntrySchema = z
  .object({
    at: IsoDateTimeSchema,
    fromPhase: JobPhaseSchema.optional(),
    toPhase: JobPhaseSchema,
    correlationId: NonEmptyStringSchema.optional(),
    requestId: NonEmptyStringSchema.optional(),
    note: NonEmptyStringSchema.optional(),
  })
  .strict();

export type JobHistoryEntry = z.infer<typeof JobHistoryEntrySchema>;

/**
 * Versioned job manifest — briefs, concepts, specs, critiques, and exports
 * are referenced by versioned paths under the job directory.
 */
export const JobManifestSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  jobId: NonEmptyStringSchema,
  correlationId: NonEmptyStringSchema,
  phase: JobPhaseSchema,
  history: z.array(JobHistoryEntrySchema).default([]),
  /** Latest pointer per kind; full history lives in `versions`. */
  latest: z
    .object({
      briefVersion: NonEmptyStringSchema.optional(),
      conceptBoardVersion: NonEmptyStringSchema.optional(),
      designSpecVersion: NonEmptyStringSchema.optional(),
      critiqueVersion: NonEmptyStringSchema.optional(),
      exportVersion: NonEmptyStringSchema.optional(),
      assetManifestVersion: NonEmptyStringSchema.optional(),
    })
    .strict()
    .default({}),
  versions: z.array(VersionedArtifactRefSchema).default([]),
  canvaDesignId: NonEmptyStringSchema.nullable().default(null),
  canvaEditUrl: z.union([UrlSchema, z.null()]).default(null),
  errorState: WorkflowErrorStateSchema.default(okWorkflowErrorState()),
})
  .strict()
  .superRefine((m, ctx) => {
    if (m.errorState.failed && m.phase !== "failed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed errorState requires phase=failed",
        path: ["phase"],
      });
    }
  });

export type JobManifest = z.infer<typeof JobManifestSchema>;
