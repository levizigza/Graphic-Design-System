import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Recognition / unique association are research hypotheses until tested.
 * Do not treat untested scores as proven brand equity.
 */
export const DistinctivenessEvidenceStatusSchema = z.enum([
  "hypothesis",
  "tested",
  "inconclusive",
]);

export type DistinctivenessEvidenceStatus = z.infer<
  typeof DistinctivenessEvidenceStatusSchema
>;

export const DistinctivenessAssetFindingSchema = z
  .object({
    assetId: NonEmptyStringSchema,
    assetLabel: NonEmptyStringSchema,
    /**
     * Hypothesis: target viewers recognize this asset when shown.
     * Remains a hypothesis until evidenceStatus === "tested".
     */
    recognitionHypothesis: z.object({
      statement: NonEmptyStringSchema,
      believedRecognized: z.boolean(),
      confidence: z.enum(["low", "medium", "high"]).default("low"),
      evidenceStatus: DistinctivenessEvidenceStatusSchema.default("hypothesis"),
      evidenceNotes: z.array(NonEmptyStringSchema).default([]),
      testedAt: IsoDateTimeSchema.optional(),
      sampleSize: z.number().int().positive().optional(),
    }),
    /**
     * Hypothesis: viewers uniquely associate the asset with this brand
     * (not a category cliché or competitor).
     */
    uniqueAssociationHypothesis: z.object({
      statement: NonEmptyStringSchema,
      believedUniqueToBrand: z.boolean(),
      confidence: z.enum(["low", "medium", "high"]).default("low"),
      evidenceStatus: DistinctivenessEvidenceStatusSchema.default("hypothesis"),
      evidenceNotes: z.array(NonEmptyStringSchema).default([]),
      testedAt: IsoDateTimeSchema.optional(),
      sampleSize: z.number().int().positive().optional(),
      confusionRisks: z.array(NonEmptyStringSchema).default([]),
    }),
    productionRecommendation: z.enum([
      "use_as_signature",
      "use_with_caution",
      "test_before_scale",
      "do_not_rely",
    ]),
  })
  .strict()
  .superRefine((finding, ctx) => {
    const rec = finding.recognitionHypothesis;
    const uniq = finding.uniqueAssociationHypothesis;

    if (rec.evidenceStatus === "hypothesis" && rec.testedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "hypothesis must not set testedAt — mark evidenceStatus tested first",
        path: ["recognitionHypothesis", "testedAt"],
      });
    }
    if (uniq.evidenceStatus === "hypothesis" && uniq.testedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "hypothesis must not set testedAt — mark evidenceStatus tested first",
        path: ["uniqueAssociationHypothesis", "testedAt"],
      });
    }

    if (
      finding.productionRecommendation === "use_as_signature" &&
      (rec.evidenceStatus !== "tested" || uniq.evidenceStatus !== "tested")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "use_as_signature requires tested evidence for recognition and unique association",
        path: ["productionRecommendation"],
      });
    }
  });

export type DistinctivenessAssetFinding = z.infer<
  typeof DistinctivenessAssetFindingSchema
>;

export const DistinctivenessAuditSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  brandId: NonEmptyStringSchema,
  brandName: NonEmptyStringSchema,
  audienceSummary: NonEmptyStringSchema,
  findings: z.array(DistinctivenessAssetFindingSchema).min(1),
  overallNotes: z.array(NonEmptyStringSchema).default([]),
  /** Explicit reminder — audits start as research, not proof. */
  researchDisclaimer: z
    .literal(
      "Findings are research hypotheses until tested with target viewers. Do not invent recognition or uniqueness claims.",
    )
    .default(
      "Findings are research hypotheses until tested with target viewers. Do not invent recognition or uniqueness claims.",
    ),
})
  .strict()
  .superRefine((audit, ctx) => {
    const ids = new Set<string>();
    for (const [i, f] of audit.findings.entries()) {
      if (ids.has(f.assetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate assetId in distinctiveness audit: ${f.assetId}`,
          path: ["findings", i, "assetId"],
        });
      }
      ids.add(f.assetId);
    }
  });

export type DistinctivenessAudit = z.infer<typeof DistinctivenessAuditSchema>;
