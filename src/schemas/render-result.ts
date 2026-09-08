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

export const ExportFormatSchema = z.enum([
  "png",
  "jpg",
  "pdf",
  "pptx",
  "mp4",
  "gif",
  "svg",
  "other",
]);

export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ToolVersionsSchema = z
  .object({
    /** Design MCP server identifier / revision if known. */
    canvaDesignMcp: NonEmptyStringSchema.optional(),
    /** Schema pack version for this workflow. */
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** Coordinator / package version. */
    coordinator: NonEmptyStringSchema.optional(),
    /** Raw tool names observed at render time. */
    toolsUsed: z.array(NonEmptyStringSchema).default([]),
  })
  .strict();

/**
 * Result of Canva production for one design.
 * IDs and URLs must come from live MCP responses — never fabricated.
 * Use failureState.failed for unsuccessful attempts; do not invent IDs.
 */
export const RenderResultSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  designSpecId: NonEmptyStringSchema,
  formatId: NonEmptyStringSchema,
  /** Canva design id from create-design-from-candidate (or equivalent). */
  designId: NonEmptyStringSchema.nullable(),
  /** Editable Canva URL — required when not failed. */
  editUrl: z.union([UrlSchema, z.null()]),
  candidateId: NonEmptyStringSchema.nullable(),
  pageIds: z.array(NonEmptyStringSchema).default([]),
  transactionId: NonEmptyStringSchema.nullable(),
  exportJobId: NonEmptyStringSchema.nullable(),
  exportFormat: ExportFormatSchema.nullable(),
  timestamps: z.object({
    generatedAt: IsoDateTimeSchema.optional(),
    createdFromCandidateAt: IsoDateTimeSchema.optional(),
    editStartedAt: IsoDateTimeSchema.optional(),
    editCommittedAt: IsoDateTimeSchema.optional(),
    exportStartedAt: IsoDateTimeSchema.optional(),
    exportCompletedAt: IsoDateTimeSchema.optional(),
  }),
  toolVersions: ToolVersionsSchema,
  failureState: FailureStateSchema.default(okFailureState()),
  localExportPath: NonEmptyStringSchema.optional(),
  localExportSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
})
  .strict()
  .superRefine((result, ctx) => {
    const failed = result.failureState.failed;

    if (!failed) {
      if (!result.designId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "designId is required on successful RenderResult — do not invent placeholders",
          path: ["designId"],
        });
      }
      if (!result.editUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "editUrl is required on successful RenderResult",
          path: ["editUrl"],
        });
      }
      if (!result.candidateId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "candidateId is required on successful RenderResult",
          path: ["candidateId"],
        });
      }
      if (!result.exportFormat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "exportFormat is required on successful RenderResult",
          path: ["exportFormat"],
        });
      }
      if (!result.timestamps.exportCompletedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timestamps.exportCompletedAt required when render succeeded",
          path: ["timestamps", "exportCompletedAt"],
        });
      }
    } else {
      // Failed renders must not pretend to have a live design handoff
      if (result.editUrl && result.designId) {
        // Allowed if partial progress; but failure message required (handled in FailureStateSchema)
      }
    }
  });

export type RenderResult = z.infer<typeof RenderResultSchema>;
