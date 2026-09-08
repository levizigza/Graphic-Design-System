import type {
  Critique,
  CritiqueDimensionId,
  CritiqueDimensionScore,
  CritiqueFinding,
  DesignVersionCritiqueRecord,
  HumanCritiqueTest,
  HumanTestAnswer,
  PairwiseComparisonSession,
  PairwiseComparisonTrial,
  PairwiseDisagreement,
  CritiqueConfidence,
} from "../schemas/critique.js";
import {
  CRITIQUE_DIMENSION_IDS,
  CritiqueSchema,
  DesignVersionCritiqueRecordSchema,
  HumanCritiqueTestSchema,
  PairwiseComparisonSessionSchema,
} from "../schemas/critique.js";
import { SCHEMA_VERSION } from "../schemas/version.js";

export type DimensionInput = {
  id: CritiqueDimensionId;
  score: number;
  notes: string;
  findings?: Array<{
    observedIssue: string;
    location?: CritiqueFinding["location"];
    likelyConsequence: string;
    concreteRevision: string;
    confidence: CritiqueConfidence;
    humanReviewRequired: boolean;
  }>;
};

export type BuildCritiqueInput = {
  renderResultId: string;
  designSpecId: string;
  designVersion: string;
  designId?: string | null;
  candidateId?: string | null;
  dimensions: DimensionInput[];
  integrityViolations?: Critique["integrityViolations"];
  passThreshold?: number;
  revisionsRemaining?: number;
  now?: string;
  id?: string;
};

function emptyLocation(): CritiqueFinding["location"] {
  return {};
}

function normalizeLocation(
  loc: CritiqueFinding["location"] | undefined,
): CritiqueFinding["location"] {
  const out: CritiqueFinding["location"] = {};
  if (!loc) return out;
  if (loc.pageIndex != null) out.pageIndex = loc.pageIndex;
  if (loc.elementId) out.elementId = loc.elementId;
  if (loc.region) out.region = loc.region;
  if (loc.field) out.field = loc.field;
  return out;
}

/**
 * Build a full ten-dimension critique. Missing dimensions are rejected by schema.
 */
export function buildCritique(input: BuildCritiqueInput): Critique {
  const now = input.now ?? new Date().toISOString();
  const byId = new Map(input.dimensions.map((d) => [d.id, d]));

  const dimensions: CritiqueDimensionScore[] = CRITIQUE_DIMENSION_IDS.map((id) => {
    const src = byId.get(id);
    if (!src) {
      throw new Error(
        `Missing critique dimension "${id}". Score all ten dimensions separately — do not substitute a single aesthetic score.`,
      );
    }
    const findings: CritiqueFinding[] = (src.findings ?? []).map((f, i) => ({
      id: `${id}-finding-${i + 1}`,
      dimensionId: id,
      observedIssue: f.observedIssue,
      location: normalizeLocation(f.location ?? emptyLocation()),
      likelyConsequence: f.likelyConsequence,
      concreteRevision: f.concreteRevision,
      confidence: f.confidence,
      humanReviewRequired: f.humanReviewRequired,
    }));
    return {
      id,
      score: src.score,
      notes: src.notes,
      findings,
    };
  });

  const findings = dimensions.flatMap((d) => d.findings);
  const revisionInstructions = [
    ...new Set(findings.map((f) => f.concreteRevision)),
  ];
  const overallScore =
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
  const passThreshold = input.passThreshold ?? 7;
  const humanReviewRequired = findings.some((f) => f.humanReviewRequired);
  const integrityViolations = input.integrityViolations ?? [];

  let decision: Critique["decision"] = "pass";
  if (integrityViolations.length > 0) {
    decision = "reject";
  } else if (overallScore < passThreshold || findings.length > 0) {
    decision = findings.some((f) => f.confidence === "high" && f.humanReviewRequired)
      ? "revise"
      : overallScore < passThreshold
        ? "revise"
        : findings.length > 0
          ? "revise"
          : "pass";
  }
  if (decision === "pass" && findings.length > 0 && overallScore >= passThreshold) {
    // Soft findings still force revise when any concrete revision exists
    decision = "revise";
  }

  if (decision === "revise" && revisionInstructions.length === 0) {
    revisionInstructions.push(
      "Revisit the lowest-scoring dimensions and apply concrete layout/copy fixes.",
    );
  }

  return CritiqueSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? `critique-${input.designSpecId}-${input.designVersion}`,
    createdAt: now,
    updatedAt: now,
    renderResultId: input.renderResultId,
    designSpecId: input.designSpecId,
    designId: input.designId ?? null,
    candidateId: input.candidateId ?? null,
    designVersion: input.designVersion,
    overallScore: Math.round(overallScore * 10) / 10,
    passThreshold,
    dimensions,
    findings,
    revisionInstructions,
    integrityViolations,
    decision,
    revisionsRemaining: input.revisionsRemaining ?? 2,
    humanReviewRequired,
  });
}

/** Mulberry32 — deterministic shuffle when seed provided. */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

export type PairwiseJudgeFn = (input: {
  leftCandidateId: string;
  rightCandidateId: string;
  dimensionId?: CritiqueDimensionId;
}) => {
  preferredCandidateId: string;
  rationale: string;
  judge?: "human" | "automated_assistant" | "other";
  isAestheticOnlyScore?: boolean;
};

/**
 * Run pairwise comparisons with randomized order, then reverse-order repeats.
 * Records disagreements. Refuses to finalize on aesthetic-only automated scores alone.
 */
export function runPairwiseComparisonSession(input: {
  designSpecId: string;
  designVersion: string;
  candidateIds: string[];
  /** Optional: compare per dimension; otherwise overall preference. */
  dimensionId?: CritiqueDimensionId;
  judge: PairwiseJudgeFn;
  seed?: number;
  now?: string;
  id?: string;
  aestheticOnlyScores?: PairwiseComparisonSession["aestheticOnlyScores"];
}): PairwiseComparisonSession {
  if (input.candidateIds.length < 2) {
    throw new Error("Pairwise comparison requires at least two candidates");
  }

  const now = input.now ?? new Date().toISOString();
  const rng = createRng(input.seed ?? Date.now() % 1_000_000);
  const randomizedOrder = shuffleInPlace([...input.candidateIds], rng);

  const trials: PairwiseComparisonTrial[] = [];
  const disagreements: PairwiseDisagreement[] = [];

  // All unique pairs from randomized order
  for (let i = 0; i < randomizedOrder.length; i += 1) {
    for (let j = i + 1; j < randomizedOrder.length; j += 1) {
      const a = randomizedOrder[i]!;
      const b = randomizedOrder[j]!;

      const judgeArgsFwd: Parameters<PairwiseJudgeFn>[0] = {
        leftCandidateId: a,
        rightCandidateId: b,
      };
      if (input.dimensionId) judgeArgsFwd.dimensionId = input.dimensionId;

      const forward = input.judge(judgeArgsFwd);
      const forwardTrial: PairwiseComparisonTrial = {
        id: `trial-${a}-${b}-fwd`,
        leftCandidateId: a,
        rightCandidateId: b,
        preferredCandidateId: forward.preferredCandidateId,
        rationale: forward.rationale,
        judge: forward.judge ?? "automated_assistant",
        isAestheticOnlyScore: forward.isAestheticOnlyScore ?? false,
        createdAt: now,
      };
      if (input.dimensionId) forwardTrial.dimensionId = input.dimensionId;
      trials.push(forwardTrial);

      const judgeArgsRev: Parameters<PairwiseJudgeFn>[0] = {
        leftCandidateId: b,
        rightCandidateId: a,
      };
      if (input.dimensionId) judgeArgsRev.dimensionId = input.dimensionId;

      const reversed = input.judge(judgeArgsRev);
      const reverseTrial: PairwiseComparisonTrial = {
        id: `trial-${b}-${a}-rev`,
        leftCandidateId: b,
        rightCandidateId: a,
        preferredCandidateId: reversed.preferredCandidateId,
        rationale: reversed.rationale,
        judge: reversed.judge ?? "automated_assistant",
        isAestheticOnlyScore: reversed.isAestheticOnlyScore ?? false,
        createdAt: now,
      };
      if (input.dimensionId) reverseTrial.dimensionId = input.dimensionId;
      trials.push(reverseTrial);

      const agreed = forward.preferredCandidateId === reversed.preferredCandidateId;
      const disagreement: PairwiseDisagreement = {
        candidateAId: a,
        candidateBId: b,
        forwardPreferredId: forward.preferredCandidateId,
        reversedPreferredId: reversed.preferredCandidateId,
        agreed,
      };
      if (input.dimensionId) disagreement.dimensionId = input.dimensionId;
      if (!agreed) {
        disagreement.notes =
          "Order-reversed comparison disagreed — do not treat either trial as decisive; escalate to human review or multi-dimension critique.";
      }
      disagreements.push(disagreement);
    }
  }

  const anyDisagreement = disagreements.some((d) => !d.agreed);
  const allAestheticAuto = trials.every(
    (t) => t.isAestheticOnlyScore && t.judge === "automated_assistant",
  );

  let finalDecision: PairwiseComparisonSession["finalDecision"] = "pending";
  let preferredCandidateId: string | null = null;
  let decisionRationale: string;

  if (allAestheticAuto) {
    finalDecision = "needs_human";
    decisionRationale =
      "All trials were aesthetic-only automated scores. One LLM aesthetic score is never the final decision — run multi-dimension critique and/or human review.";
  } else if (anyDisagreement) {
    finalDecision = "needs_human";
    decisionRationale =
      "Reverse-order pairwise trials disagreed. Recorded disagreement; human review required before selecting a candidate.";
  } else {
    // Tally agreed winners
    const wins = new Map<string, number>();
    for (const d of disagreements) {
      if (!d.agreed) continue;
      wins.set(d.forwardPreferredId, (wins.get(d.forwardPreferredId) ?? 0) + 1);
    }
    const ranked = [...wins.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) {
      finalDecision = "tie";
      decisionRationale = "No decisive agreed pairwise winner.";
    } else if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) {
      finalDecision = "tie";
      decisionRationale = "Tied pairwise wins after order-reversed agreement.";
    } else {
      preferredCandidateId = ranked[0]![0];
      finalDecision =
        preferredCandidateId === input.candidateIds[0] ? "prefer_a" : "prefer_b";
      // For >2 candidates, prefer_a/b is approximate; still store preferredCandidateId
      if (input.candidateIds.length > 2) {
        decisionRationale = `Agreed pairwise winner after randomization + reverse-order confirmation: ${preferredCandidateId}. Confirm via ten-dimension critique — not aesthetic score alone.`;
      } else {
        decisionRationale = `Agreed pairwise winner after reverse-order confirmation: ${preferredCandidateId}.`;
      }
    }
  }

  return PairwiseComparisonSessionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? `pairwise-${input.designSpecId}-${input.designVersion}`,
    createdAt: now,
    updatedAt: now,
    designSpecId: input.designSpecId,
    designVersion: input.designVersion,
    candidateIds: input.candidateIds,
    randomizedOrder,
    trials,
    disagreements,
    aestheticOnlyScores: input.aestheticOnlyScores ?? [],
    finalDecision,
    preferredCandidateId,
    decisionRationale,
  });
}

function fuzzyMatch(expected: string, response: string): boolean {
  const a = expected.trim().toLowerCase();
  const b = response.trim().toLowerCase();
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

/**
 * Lightweight human test: 2s impression, message recall, brand recognition, CTA comprehension.
 */
export function buildHumanCritiqueTest(input: {
  designSpecId: string;
  designVersion: string;
  designId?: string | null;
  candidateId?: string | null;
  participantId?: string;
  expectedMessage: string;
  expectedBrand: string;
  expectedCta: string;
  twoSecondImpression: string;
  messageRecall: string;
  brandRecognition: string;
  ctaComprehension: string;
  now?: string;
  id?: string;
}): HumanCritiqueTest {
  const now = input.now ?? new Date().toISOString();
  const answers: HumanTestAnswer[] = [
    {
      questionId: "two_second_impression",
      response: input.twoSecondImpression,
      correct: input.twoSecondImpression.trim().length > 0,
    },
    {
      questionId: "message_recall",
      response: input.messageRecall,
      correct: fuzzyMatch(input.expectedMessage, input.messageRecall),
    },
    {
      questionId: "brand_recognition",
      response: input.brandRecognition,
      correct: fuzzyMatch(input.expectedBrand, input.brandRecognition),
    },
    {
      questionId: "cta_comprehension",
      response: input.ctaComprehension,
      correct: fuzzyMatch(input.expectedCta, input.ctaComprehension),
    },
  ];

  const scores = {
    messageRecallCorrect: Boolean(answers[1]?.correct),
    brandRecognitionCorrect: Boolean(answers[2]?.correct),
    ctaComprehensionCorrect: Boolean(answers[3]?.correct),
    impressionCaptured: Boolean(answers[0]?.correct),
  };

  const summary = [
    scores.impressionCaptured ? "impression captured" : "impression missing",
    scores.messageRecallCorrect ? "message recalled" : "message missed",
    scores.brandRecognitionCorrect ? "brand recognized" : "brand missed",
    scores.ctaComprehensionCorrect ? "CTA clear" : "CTA unclear",
  ].join("; ");

  const record: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? `human-test-${input.designSpecId}-${input.designVersion}`,
    createdAt: now,
    updatedAt: now,
    designSpecId: input.designSpecId,
    designId: input.designId ?? null,
    candidateId: input.candidateId ?? null,
    designVersion: input.designVersion,
    twoSecondExposureMs: 2000,
    expectedMessage: input.expectedMessage,
    expectedBrand: input.expectedBrand,
    expectedCta: input.expectedCta,
    answers,
    scores,
    summary,
  };
  if (input.participantId) record.participantId = input.participantId;

  return HumanCritiqueTestSchema.parse(record);
}

/**
 * Store critique (+ optional pairwise + human test) with the design version.
 */
export function storeDesignVersionCritique(input: {
  designVersion: string;
  designSpecId: string;
  designId?: string | null;
  candidateId?: string | null;
  critique: Critique;
  pairwiseSession?: PairwiseComparisonSession;
  humanTest?: HumanCritiqueTest;
  now?: string;
  id?: string;
}): DesignVersionCritiqueRecord {
  const now = input.now ?? new Date().toISOString();
  if (input.critique.designVersion !== input.designVersion) {
    throw new Error("critique.designVersion must match the stored designVersion");
  }

  const record: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? `dvc-${input.designSpecId}-${input.designVersion}`,
    createdAt: now,
    updatedAt: now,
    designVersion: input.designVersion,
    designSpecId: input.designSpecId,
    designId: input.designId ?? input.critique.designId ?? null,
    candidateId: input.candidateId ?? input.critique.candidateId ?? null,
    critiqueId: input.critique.id,
    critique: input.critique,
  };
  if (input.pairwiseSession) {
    record.pairwiseSessionId = input.pairwiseSession.id;
    record.pairwiseSession = input.pairwiseSession;
  }
  if (input.humanTest) {
    record.humanTestId = input.humanTest.id;
    record.humanTest = input.humanTest;
  }

  return DesignVersionCritiqueRecordSchema.parse(record);
}
