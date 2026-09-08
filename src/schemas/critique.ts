import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Critique dimensions — scored separately; never collapsed into one aesthetic score.
 */
export const CritiqueDimensionIdSchema = z.enum([
  "message_comprehension",
  "audience_relevance",
  "visual_hierarchy",
  "brand_recognition",
  "distinctiveness",
  "memorability",
  "cta_clarity",
  "accessibility",
  "production_readiness",
  "aesthetic_appropriateness",
]);

export type CritiqueDimensionId = z.infer<typeof CritiqueDimensionIdSchema>;

export const CRITIQUE_DIMENSION_IDS: CritiqueDimensionId[] = [
  "message_comprehension",
  "audience_relevance",
  "visual_hierarchy",
  "brand_recognition",
  "distinctiveness",
  "memorability",
  "cta_clarity",
  "accessibility",
  "production_readiness",
  "aesthetic_appropriateness",
];

export const CritiqueConfidenceSchema = z.enum([
  "low",
  "medium",
  "high",
]);

export type CritiqueConfidence = z.infer<typeof CritiqueConfidenceSchema>;

export const CritiqueFindingLocationSchema = z
  .object({
    pageIndex: z.number().int().positive().optional(),
    elementId: NonEmptyStringSchema.optional(),
    region: NonEmptyStringSchema.optional(),
    field: NonEmptyStringSchema.optional(),
  })
  .strict();

/**
 * Every critique finding must identify issue, location, consequence,
 * concrete revision, confidence, and human-review requirement.
 */
export const CritiqueFindingSchema = z
  .object({
    id: NonEmptyStringSchema,
    dimensionId: CritiqueDimensionIdSchema,
    observedIssue: NonEmptyStringSchema,
    location: CritiqueFindingLocationSchema,
    likelyConsequence: NonEmptyStringSchema,
    concreteRevision: NonEmptyStringSchema,
    confidence: CritiqueConfidenceSchema,
    humanReviewRequired: z.boolean(),
  })
  .strict();

export type CritiqueFinding = z.infer<typeof CritiqueFindingSchema>;

export const CritiqueDimensionScoreSchema = z
  .object({
    id: CritiqueDimensionIdSchema,
    score: z.number().min(0).max(10),
    notes: NonEmptyStringSchema,
    findings: z.array(CritiqueFindingSchema).default([]),
  })
  .strict();

export type CritiqueDimensionScore = z.infer<typeof CritiqueDimensionScoreSchema>;

/** @deprecated Alias — prefer CritiqueDimensionScoreSchema */
export const CritiqueDimensionSchema = CritiqueDimensionScoreSchema;

/**
 * Structured critique for one design version / candidate.
 * Aesthetic appropriateness is one dimension among ten — never the sole decision.
 */
export const CritiqueSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  renderResultId: NonEmptyStringSchema,
  designSpecId: NonEmptyStringSchema,
  /** Design / candidate identity this critique is bound to. */
  designId: NonEmptyStringSchema.nullable().default(null),
  candidateId: NonEmptyStringSchema.nullable().default(null),
  /** Version string stored with the design (e.g. manifest version or vN). */
  designVersion: NonEmptyStringSchema,
  overallScore: z.number().min(0).max(10),
  passThreshold: z.number().min(0).max(10).default(7),
  /**
   * Must include all ten dimensions. Scores are independent —
   * do not replace with a single LLM aesthetic score.
   */
  dimensions: z.array(CritiqueDimensionScoreSchema).length(10),
  findings: z.array(CritiqueFindingSchema).default([]),
  revisionInstructions: z.array(NonEmptyStringSchema).default([]),
  integrityViolations: z
    .array(
      z
        .object({
          kind: z.enum([
            "invented_claim",
            "fabricated_contact",
            "unsupported_price",
            "unsupported_date",
            "unsupported_testimonial",
            "unsupported_logo",
            "unsupported_certification",
            "unapproved_copy",
            "other",
          ]),
          detail: NonEmptyStringSchema,
          observedText: NonEmptyStringSchema.optional(),
        })
        .strict(),
    )
    .default([]),
  decision: z.enum(["pass", "revise", "reject"]),
  revisionsRemaining: z.number().int().min(0).default(2),
  humanReviewRequired: z.boolean().default(false),
  /** Optional link to pairwise comparison + human test records. */
  comparisonSessionId: NonEmptyStringSchema.optional(),
  humanTestId: NonEmptyStringSchema.optional(),
})
  .strict()
  .superRefine((c, ctx) => {
    const ids = c.dimensions.map((d) => d.id);
    const unique = new Set(ids);
    if (unique.size !== 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Critique must score each of the ten dimensions exactly once",
        path: ["dimensions"],
      });
    }
    for (const required of CRITIQUE_DIMENSION_IDS) {
      if (!unique.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing critique dimension: ${required}`,
          path: ["dimensions"],
        });
      }
    }

    if (c.integrityViolations.length > 0 && c.decision === "pass") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot pass critique while integrity violations exist (invented claims, contacts, prices, dates, testimonials, logos, certifications)",
        path: ["decision"],
      });
    }
    if (c.decision === "pass" && c.overallScore < c.passThreshold) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "overallScore below passThreshold cannot decision=pass",
        path: ["decision"],
      });
    }
    if (c.decision === "revise" && c.revisionInstructions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "revise requires revisionInstructions",
        path: ["revisionInstructions"],
      });
    }

    const needsHuman =
      c.findings.some((f) => f.humanReviewRequired) ||
      c.dimensions.some((d) => d.findings.some((f) => f.humanReviewRequired));
    if (needsHuman && !c.humanReviewRequired) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "humanReviewRequired must be true when any finding requires human review",
        path: ["humanReviewRequired"],
      });
    }
  });

export type Critique = z.infer<typeof CritiqueSchema>;

/** One directed pairwise comparison (A shown left/first vs B). */
export const PairwiseComparisonTrialSchema = z
  .object({
    id: NonEmptyStringSchema,
    dimensionId: CritiqueDimensionIdSchema.optional(),
    leftCandidateId: NonEmptyStringSchema,
    rightCandidateId: NonEmptyStringSchema,
    /** Winner of this presentation order only. */
    preferredCandidateId: NonEmptyStringSchema,
    rationale: NonEmptyStringSchema,
    judge: z.enum(["human", "automated_assistant", "other"]),
    /** Never treat as final decision by itself. */
    isAestheticOnlyScore: z.boolean().default(false),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((t, ctx) => {
    if (
      t.preferredCandidateId !== t.leftCandidateId &&
      t.preferredCandidateId !== t.rightCandidateId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "preferredCandidateId must be left or right candidate",
        path: ["preferredCandidateId"],
      });
    }
    if (t.isAestheticOnlyScore && t.judge === "automated_assistant") {
      // Allowed to record, but session logic must not finalize on this alone.
    }
  });

export type PairwiseComparisonTrial = z.infer<typeof PairwiseComparisonTrialSchema>;

export const PairwiseDisagreementSchema = z
  .object({
    candidateAId: NonEmptyStringSchema,
    candidateBId: NonEmptyStringSchema,
    dimensionId: CritiqueDimensionIdSchema.optional(),
    forwardPreferredId: NonEmptyStringSchema,
    reversedPreferredId: NonEmptyStringSchema,
    agreed: z.boolean(),
    notes: NonEmptyStringSchema.optional(),
  })
  .strict();

export type PairwiseDisagreement = z.infer<typeof PairwiseDisagreementSchema>;

/**
 * Automated comparison protocol:
 * randomize order, repeat with order reversed, record disagreement.
 * Never use one LLM aesthetic score as the final decision.
 */
export const PairwiseComparisonSessionSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  designSpecId: NonEmptyStringSchema,
  designVersion: NonEmptyStringSchema,
  candidateIds: z.array(NonEmptyStringSchema).min(2),
  /** Presentation order after randomization. */
  randomizedOrder: z.array(NonEmptyStringSchema).min(2),
  trials: z.array(PairwiseComparisonTrialSchema).min(2),
  disagreements: z.array(PairwiseDisagreementSchema).default([]),
  /**
   * Optional aesthetic-only assistant scores — informational only.
   * Must not be copied into finalDecision without human/multi-dimension evidence.
   */
  aestheticOnlyScores: z
    .array(
      z
        .object({
          candidateId: NonEmptyStringSchema,
          score: z.number().min(0).max(10),
          modelLabel: NonEmptyStringSchema.optional(),
          note: z
            .literal("Informational only — not a final decision signal")
            .default("Informational only — not a final decision signal"),
        })
        .strict(),
    )
    .default([]),
  finalDecision: z.enum(["pending", "prefer_a", "prefer_b", "tie", "needs_human"]),
  preferredCandidateId: NonEmptyStringSchema.nullable().default(null),
  decisionRationale: NonEmptyStringSchema,
})
  .strict()
  .superRefine((s, ctx) => {
    if (s.finalDecision === "prefer_a" || s.finalDecision === "prefer_b") {
      if (!s.preferredCandidateId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "preferredCandidateId required for prefer_a/prefer_b",
          path: ["preferredCandidateId"],
        });
      }
    }
    // Guard: cannot finalize solely from aesthetic-only automated scores
    const onlyAestheticAutos =
      s.trials.length > 0 &&
      s.trials.every((t) => t.isAestheticOnlyScore && t.judge === "automated_assistant");
    if (
      onlyAestheticAutos &&
      (s.finalDecision === "prefer_a" || s.finalDecision === "prefer_b")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot finalize pairwise decision from aesthetic-only automated scores alone — require reverse-order agreement, multi-dimension critique, or human review",
        path: ["finalDecision"],
      });
    }
  });

export type PairwiseComparisonSession = z.infer<
  typeof PairwiseComparisonSessionSchema
>;

export const HumanTestAnswerSchema = z
  .object({
    questionId: z.enum([
      "two_second_impression",
      "message_recall",
      "brand_recognition",
      "cta_comprehension",
    ]),
    response: NonEmptyStringSchema,
    correct: z.boolean().optional(),
    notes: NonEmptyStringSchema.optional(),
  })
  .strict();

export type HumanTestAnswer = z.infer<typeof HumanTestAnswerSchema>;

/**
 * Lightweight human test protocol.
 */
export const HumanCritiqueTestSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  designSpecId: NonEmptyStringSchema,
  designId: NonEmptyStringSchema.nullable().default(null),
  candidateId: NonEmptyStringSchema.nullable().default(null),
  designVersion: NonEmptyStringSchema,
  participantId: NonEmptyStringSchema.optional(),
  /** Exposure duration for first-impression (ms). */
  twoSecondExposureMs: z.literal(2000).default(2000),
  expectedMessage: NonEmptyStringSchema,
  expectedBrand: NonEmptyStringSchema,
  expectedCta: NonEmptyStringSchema,
  answers: z.array(HumanTestAnswerSchema).min(4),
  scores: z.object({
    messageRecallCorrect: z.boolean(),
    brandRecognitionCorrect: z.boolean(),
    ctaComprehensionCorrect: z.boolean(),
    impressionCaptured: z.boolean(),
  }),
  summary: NonEmptyStringSchema,
})
  .strict()
  .superRefine((t, ctx) => {
    const ids = new Set(t.answers.map((a) => a.questionId));
    for (const q of [
      "two_second_impression",
      "message_recall",
      "brand_recognition",
      "cta_comprehension",
    ] as const) {
      if (!ids.has(q)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing human test answer: ${q}`,
          path: ["answers"],
        });
      }
    }
  });

export type HumanCritiqueTest = z.infer<typeof HumanCritiqueTestSchema>;

/**
 * Bundle stored with a design version: critique + optional pairwise + human test.
 */
export const DesignVersionCritiqueRecordSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  designVersion: NonEmptyStringSchema,
  designSpecId: NonEmptyStringSchema,
  designId: NonEmptyStringSchema.nullable().default(null),
  candidateId: NonEmptyStringSchema.nullable().default(null),
  critiqueId: NonEmptyStringSchema,
  pairwiseSessionId: NonEmptyStringSchema.optional(),
  humanTestId: NonEmptyStringSchema.optional(),
  critique: CritiqueSchema,
  pairwiseSession: PairwiseComparisonSessionSchema.optional(),
  humanTest: HumanCritiqueTestSchema.optional(),
})
  .strict();

export type DesignVersionCritiqueRecord = z.infer<
  typeof DesignVersionCritiqueRecordSchema
>;
