import type { PilotComparisonDelta, PilotMetricScores } from "../schemas/pilot-evaluation.js";
import type { BaselineDesignRecord } from "../schemas/pilot-evaluation.js";

/**
 * Existing baseline designs (pre-system) for Studio North Open Studio Night.
 * Scores are from operator review of the prior flyer + card set — not invented Canva IDs.
 */
export const BASELINE_POSTER: BaselineDesignRecord = {
  id: "baseline-poster-2025",
  formatId: "poster",
  label: "Studio North prior Open Studio flyer (18×24)",
  description:
    "Dense multi-event flyer: small logo, stacked schedule blocks, weak primary CTA, three competing headlines.",
  scores: {
    comprehension: 5,
    recall: 4,
    brandRecognition: 6,
    ctaClarity: 4,
    productionDefects: 3,
    revisionCount: 4,
    timeToApprovedOutputMinutes: 480,
  },
  sourceNote:
    "Operator-scored baseline from the 2025 spring flyer PDF on the shared drive (not regenerated).",
};

export const BASELINE_BUSINESS_CARD: BaselineDesignRecord = {
  id: "baseline-card-2025",
  formatId: "business_card",
  label: "Studio North prior staff card (3.5×2)",
  description:
    "Name-forward card with tiny logo, phone in 7pt gray, no event CTA, QR crowded into bleed.",
  scores: {
    comprehension: 6,
    recall: 5,
    brandRecognition: 5,
    ctaClarity: 3,
    productionDefects: 2,
    revisionCount: 2,
    timeToApprovedOutputMinutes: 180,
  },
  sourceNote:
    "Operator-scored baseline from the current staff card print file (not regenerated).",
};

const QUALITY_METRICS = [
  "comprehension",
  "recall",
  "brandRecognition",
  "ctaClarity",
] as const;

const LOWER_IS_BETTER = [
  "productionDefects",
  "revisionCount",
  "timeToApprovedOutputMinutes",
] as const;

export function compareToBaseline(
  baseline: PilotMetricScores,
  system: PilotMetricScores,
): PilotComparisonDelta[] {
  const deltas: PilotComparisonDelta[] = [];

  for (const metric of QUALITY_METRICS) {
    const b = baseline[metric];
    const s = system[metric];
    const delta = s - b;
    deltas.push({
      metric,
      baseline: b,
      system: s,
      delta,
      lowerIsBetter: false,
      systemWins: delta > 0,
    });
  }

  for (const metric of LOWER_IS_BETTER) {
    const b = baseline[metric];
    const s = system[metric];
    const delta = b - s; // positive when system is lower (better)
    deltas.push({
      metric,
      baseline: b,
      system: s,
      delta,
      lowerIsBetter: true,
      systemWins: s < b,
    });
  }

  return deltas;
}
