import { z } from "zod";
import { SCHEMA_VERSION } from "./version.js";

/** ISO-8601 timestamp string. */
export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: "Must be an ISO-8601 datetime with offset" });

export const NonEmptyStringSchema = z.string().trim().min(1, "Required non-empty string");

export const UrlSchema = z.string().url("Must be a valid URL");

export const HexColorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/, "Must be a hex color");

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "Must be a 64-char hex SHA-256");

/** Document envelope — every persisted workflow object carries this. */
export const DocumentMetaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

/**
 * Hard constraints — fail closed. Missing or violated → reject the job.
 * Never treat these as creative suggestions.
 */
export const HardConstraintsSchema = z.object({
  /** Exact strings that MUST appear on the design (from approved copy). */
  mustIncludeText: z.array(NonEmptyStringSchema).default([]),
  /** Strings that MUST NOT appear. */
  mustExcludeText: z.array(NonEmptyStringSchema).default([]),
  /** Locked channel / physical format identifier (e.g. poster, business_card). */
  formatId: NonEmptyStringSchema,
  /** Width × height in the unit declared by `dimensionUnit`. */
  dimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(["px", "in", "mm", "cm"]),
  }),
  localization: z.object({
    locale: NonEmptyStringSchema.describe("BCP-47 locale, e.g. en-US"),
    language: NonEmptyStringSchema,
    region: NonEmptyStringSchema.optional(),
    rtl: z.boolean().default(false),
  }),
  accessibility: z.object({
    minContrastRatio: z.number().positive().default(4.5),
    minBodyFontPt: z.number().positive().optional(),
    altTextRequired: z.boolean().default(true),
    colorBlindSafe: z.boolean().default(false),
    notes: z.array(NonEmptyStringSchema).default([]),
  }),
  printer: z
    .object({
      required: z.boolean().default(false),
      bleedInches: z.number().nonnegative().optional(),
      safeMarginInches: z.number().nonnegative().optional(),
      colorMode: z.enum(["rgb", "cmyk"]).optional(),
      paperStock: NonEmptyStringSchema.optional(),
      finish: NonEmptyStringSchema.optional(),
      notes: z.array(NonEmptyStringSchema).default([]),
    })
    .default({ required: false, notes: [] }),
  /** Claim / asset kinds that are forbidden unless backed by an ApprovalRecord. */
  requireApprovalFor: z
    .array(
      z.enum([
        "copy",
        "price",
        "date",
        "testimonial",
        "logo",
        "certification",
        "contact",
        "claim",
      ]),
    )
    .default([
      "copy",
      "price",
      "date",
      "testimonial",
      "logo",
      "certification",
      "contact",
      "claim",
    ]),
});

export type HardConstraints = z.infer<typeof HardConstraintsSchema>;

/**
 * Creative preferences — soft guidance. May be ignored or traded off;
 * never used to invent facts, contacts, prices, or credentials.
 */
export const CreativePreferencesSchema = z.object({
  moodKeywords: z.array(NonEmptyStringSchema).default([]),
  visualStyle: NonEmptyStringSchema.optional(),
  preferredPaletteHints: z.array(HexColorSchema).default([]),
  typographyHints: z.array(NonEmptyStringSchema).default([]),
  imageryHints: z.array(NonEmptyStringSchema).default([]),
  doPrefer: z.array(NonEmptyStringSchema).default([]),
  doAvoid: z.array(NonEmptyStringSchema).default([]),
  referenceUrls: z.array(UrlSchema).default([]),
  notes: z.array(NonEmptyStringSchema).default([]),
});

export type CreativePreferences = z.infer<typeof CreativePreferencesSchema>;

export const ApprovalSubjectSchema = z.enum([
  "copy",
  "price",
  "date",
  "testimonial",
  "logo",
  "certification",
  "contact",
  "claim",
  "concept",
  "design",
  "export",
  "brief",
  "brand",
]);

export type ApprovalSubject = z.infer<typeof ApprovalSubjectSchema>;

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "revoked",
]);

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * Provenance for any factual assertion that must not be invented.
 * Unsupported claims fail validation when required by hard constraints.
 */
export const ClaimKindSchema = z.enum([
  "price",
  "date",
  "testimonial",
  "logo",
  "certification",
  "contact",
  "other",
]);

export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const SupportedClaimSchema = z
  .object({
    id: NonEmptyStringSchema,
    kind: ClaimKindSchema,
    /** Exact claim text as it may appear on-design. */
    text: NonEmptyStringSchema,
    /** Human-readable source (doc title, ticket, CRM field). */
    sourceLabel: NonEmptyStringSchema,
    /** Optional URL or file path to the source of truth. */
    sourceRef: z.union([UrlSchema, NonEmptyStringSchema]).optional(),
    /**
     * Must reference an ApprovalRecord.id with status "approved"
     * for the matching subject. Empty/missing → reject at brief parse
     * when hard constraints require approval for this kind.
     */
    approvalRecordId: NonEmptyStringSchema,
  })
  .strict();

export type SupportedClaim = z.infer<typeof SupportedClaimSchema>;

export const FailureStateSchema = z
  .object({
    failed: z.boolean(),
    code: NonEmptyStringSchema.optional(),
    message: NonEmptyStringSchema.optional(),
    retryable: z.boolean().optional(),
    occurredAt: IsoDateTimeSchema.optional(),
    correlationId: NonEmptyStringSchema.optional(),
    requestId: NonEmptyStringSchema.optional(),
    jobId: NonEmptyStringSchema.optional(),
    /** Redacted details only — never tokens or credentials. */
    details: z.record(z.unknown()).optional(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.failed && !val.message) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "failureState.message is required when failed is true",
        path: ["message"],
      });
    }
  });

export type FailureState = z.infer<typeof FailureStateSchema>;

export const okFailureState = (): FailureState => ({ failed: false });
