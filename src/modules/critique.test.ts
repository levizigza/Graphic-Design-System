import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRITIQUE_DIMENSION_IDS,
  type CritiqueDimensionId,
} from "../schemas/critique.js";
import {
  buildCritique,
  buildHumanCritiqueTest,
  runPairwiseComparisonSession,
  storeDesignVersionCritique,
  type DimensionInput,
} from "./critique.js";

const now = "2026-09-08T07:00:00.000Z";

function allDimensions(overrides?: Partial<Record<CritiqueDimensionId, Partial<DimensionInput>>>): DimensionInput[] {
  return CRITIQUE_DIMENSION_IDS.map((id) => {
    const row: DimensionInput = {
      id,
      score: overrides?.[id]?.score ?? 8,
      notes: overrides?.[id]?.notes ?? `${id} looks solid`,
    };
    const findings = overrides?.[id]?.findings;
    if (findings) row.findings = findings;
    return row;
  });
}

describe("buildCritique", () => {
  it("requires all ten dimensions and structured findings", () => {
    const critique = buildCritique({
      renderResultId: "render-1",
      designSpecId: "spec-1",
      designVersion: "v3",
      designId: "DAG1",
      candidateId: "cand-a",
      now,
      dimensions: allDimensions({
        cta_clarity: {
          score: 5,
          notes: "CTA competes with secondary type",
          findings: [
            {
              observedIssue: "CTA is below fold-equivalent and low contrast",
              location: { field: "cta", region: "lower_third" },
              likelyConsequence: "Viewers miss the next step",
              concreteRevision: "Enlarge CTA, increase contrast, place in primary exit zone",
              confidence: "high",
              humanReviewRequired: true,
            },
          ],
        },
      }),
    });
    assert.equal(critique.dimensions.length, 10);
    assert.equal(critique.designVersion, "v3");
    assert.equal(critique.humanReviewRequired, true);
    assert.equal(critique.decision, "revise");
    assert.ok(critique.findings[0]?.concreteRevision.includes("CTA"));
    assert.equal(critique.findings[0]?.confidence, "high");
  });

  it("rejects incomplete dimension sets", () => {
    assert.throws(() =>
      buildCritique({
        renderResultId: "r",
        designSpecId: "s",
        designVersion: "v1",
        now,
        dimensions: allDimensions().slice(0, 9),
      }),
    );
  });
});

describe("pairwise comparisons", () => {
  it("randomizes order, reverses pairs, and records disagreement", () => {
    let call = 0;
    const session = runPairwiseComparisonSession({
      designSpecId: "spec-1",
      designVersion: "v2",
      candidateIds: ["cand-a", "cand-b"],
      seed: 42,
      now,
      judge: ({ leftCandidateId, rightCandidateId }) => {
        call += 1;
        // Disagree under order reversal: always prefer whatever is on the left
        return {
          preferredCandidateId: leftCandidateId,
          rationale: `Prefer ${leftCandidateId} over ${rightCandidateId} in this order`,
          judge: "human",
          isAestheticOnlyScore: false,
        };
      },
    });
    assert.equal(session.trials.length, 2);
    assert.equal(session.disagreements.length, 1);
    assert.equal(session.disagreements[0]?.agreed, false);
    assert.equal(session.finalDecision, "needs_human");
    assert.ok(call >= 2);
    assert.deepEqual(session.randomizedOrder.slice().sort(), ["cand-a", "cand-b"]);
  });

  it("never finalizes on aesthetic-only automated scores", () => {
    const session = runPairwiseComparisonSession({
      designSpecId: "spec-1",
      designVersion: "v2",
      candidateIds: ["cand-a", "cand-b"],
      seed: 7,
      now,
      aestheticOnlyScores: [
        {
          candidateId: "cand-a",
          score: 9.5,
          note: "Informational only — not a final decision signal",
        },
      ],
      judge: () => ({
        preferredCandidateId: "cand-a",
        rationale: "Looks prettier",
        judge: "automated_assistant",
        isAestheticOnlyScore: true,
      }),
    });
    assert.equal(session.finalDecision, "needs_human");
    assert.match(session.decisionRationale, /aesthetic-only|never the final decision/i);
  });

  it("accepts agreed reverse-order human preference", () => {
    const session = runPairwiseComparisonSession({
      designSpecId: "spec-1",
      designVersion: "v2",
      candidateIds: ["cand-a", "cand-b"],
      seed: 1,
      now,
      judge: () => ({
        preferredCandidateId: "cand-b",
        rationale: "Clearer CTA and message",
        judge: "human",
        isAestheticOnlyScore: false,
      }),
    });
    assert.equal(session.disagreements[0]?.agreed, true);
    assert.equal(session.preferredCandidateId, "cand-b");
    assert.ok(
      session.finalDecision === "prefer_a" || session.finalDecision === "prefer_b",
    );
  });
});

describe("human critique test", () => {
  it("scores impression, recall, brand, and CTA", () => {
    const test = buildHumanCritiqueTest({
      designSpecId: "spec-1",
      designVersion: "v4",
      designId: "DAG1",
      candidateId: "cand-b",
      expectedMessage: "Open Studio Night",
      expectedBrand: "Studio North",
      expectedCta: "RSVP today",
      twoSecondImpression: "Warm studio invite",
      messageRecall: "Open Studio Night this Friday",
      brandRecognition: "Studio North",
      ctaComprehension: "RSVP today",
      now,
    });
    assert.equal(test.twoSecondExposureMs, 2000);
    assert.equal(test.scores.messageRecallCorrect, true);
    assert.equal(test.scores.brandRecognitionCorrect, true);
    assert.equal(test.scores.ctaComprehensionCorrect, true);
    assert.equal(test.answers.length, 4);
  });
});

describe("design version storage", () => {
  it("stores critique, pairwise, and human test with design version", () => {
    const critique = buildCritique({
      renderResultId: "render-1",
      designSpecId: "spec-1",
      designVersion: "v5",
      designId: "DAG1",
      candidateId: "cand-b",
      now,
      dimensions: allDimensions(),
    });
    // No findings → may still revise if we force findings empty and high scores
    // overall high with no findings → pass
    assert.equal(critique.decision, "pass");

    const pairwise = runPairwiseComparisonSession({
      designSpecId: "spec-1",
      designVersion: "v5",
      candidateIds: ["cand-a", "cand-b"],
      seed: 3,
      now,
      judge: () => ({
        preferredCandidateId: "cand-b",
        rationale: "Stronger hierarchy",
        judge: "human",
      }),
    });
    const human = buildHumanCritiqueTest({
      designSpecId: "spec-1",
      designVersion: "v5",
      designId: "DAG1",
      candidateId: "cand-b",
      expectedMessage: "Open Studio Night",
      expectedBrand: "Studio North",
      expectedCta: "RSVP",
      twoSecondImpression: "Inviting",
      messageRecall: "Open Studio Night",
      brandRecognition: "Studio North",
      ctaComprehension: "RSVP",
      now,
    });
    const record = storeDesignVersionCritique({
      designVersion: "v5",
      designSpecId: "spec-1",
      designId: "DAG1",
      candidateId: "cand-b",
      critique,
      pairwiseSession: pairwise,
      humanTest: human,
      now,
    });
    assert.equal(record.designVersion, "v5");
    assert.equal(record.critiqueId, critique.id);
    assert.equal(record.pairwiseSessionId, pairwise.id);
    assert.equal(record.humanTestId, human.id);
    assert.equal(record.critique.dimensions.length, 10);
  });
});
