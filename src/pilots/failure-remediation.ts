import type {
  CanvaProvenance,
  PilotFailureRecord,
} from "../schemas/pilot-evaluation.js";

export type FailureRemediation = {
  failureId: string;
  kind: "validation_rule" | "schema_field" | "workflow_step";
  reference: string;
  description: string;
};

/**
 * Convert documented pilot failures into durable remediations.
 * Recurring / blocker failures must land as a rule, schema field, or workflow step.
 */
export function convertFailuresToRemediations(
  failures: readonly PilotFailureRecord[],
): FailureRemediation[] {
  const out: FailureRemediation[] = [];

  for (const f of failures) {
    if (f.id === "F001" || f.summary.includes("Canva Design MCP not connected")) {
      out.push({
        failureId: f.id,
        kind: "validation_rule",
        reference: "assertFinalDesignApprovalAllowed",
        description:
          "Final design approval is rejected unless canvaProvenance.source === live_design_mcp, with designId, editUrl, and proofed export present.",
      });
      out.push({
        failureId: f.id,
        kind: "schema_field",
        reference: "PilotFormatPackageSchema.canvaProvenance",
        description:
          "Packages record Canva provenance; approved status is schema-invalid for harness mocks.",
      });
      out.push({
        failureId: f.id,
        kind: "workflow_step",
        reference: "Phase 0 — Connect & discover Canva Design MCP",
        description:
          "Pilot overallStatus stays complete_blocked_pending_live_canva until live MCP handoff succeeds.",
      });
      continue;
    }

    if (
      f.id.startsWith("F-cta-contrast") ||
      (f.stage === "format_adaptation" && f.detail.includes("Contrast")) ||
      (f.stage === "preflight" && f.detail.includes("Contrast"))
    ) {
      out.push({
        failureId: f.id,
        kind: "validation_rule",
        reference: "assertBrandCtaContrast",
        description:
          "Reject brand CTA fill/text pairs below print contrast (4.5:1) before Canva production; Studio North uses darkened kiln #8B3416 with white CTA text.",
      });
      out.push({
        failureId: f.id,
        kind: "workflow_step",
        reference: "brand_cta_contrast_gate_before_production",
        description:
          "Run assertBrandCtaContrast on accent CTA recipes during format adaptation; revise palette or type color before generate-design.",
      });
      continue;
    }

    if (f.stage === "preflight" && f.severity !== "observation") {
      out.push({
        failureId: f.id,
        kind: "workflow_step",
        reference: "runPreflight before finalApproval",
        description:
          "Hard preflight failures must block design approval; revise ≤2 then re-preflight.",
      });
    }
  }

  return out;
}

export class FinalDesignApprovalError extends Error {
  readonly code = "final_design_approval_blocked" as const;
  constructor(message: string) {
    super(message);
    this.name = "FinalDesignApprovalError";
  }
}

/**
 * Validation rule converted from pilot failure F001.
 * Harness mock Canva IDs must never receive production approval.
 */
export function assertFinalDesignApprovalAllowed(input: {
  canvaProvenance: CanvaProvenance;
  designId: string | null;
  editUrl: string | null;
  exportProofed: boolean;
  humanRecommendApproval: boolean;
}): void {
  if (input.canvaProvenance.source !== "live_design_mcp") {
    throw new FinalDesignApprovalError(
      `Final design approval blocked: canvaProvenance.source is ${input.canvaProvenance.source}, require live_design_mcp`,
    );
  }
  if (!input.designId?.trim() || !input.editUrl?.trim()) {
    throw new FinalDesignApprovalError(
      "Final design approval blocked: designId and editUrl required from live handoff",
    );
  }
  if (input.designId.startsWith("PILOT_MOCK_")) {
    throw new FinalDesignApprovalError(
      "Final design approval blocked: PILOT_MOCK_* ids are harness-only",
    );
  }
  if (!input.exportProofed) {
    throw new FinalDesignApprovalError(
      "Final design approval blocked: export not proofed",
    );
  }
  if (!input.humanRecommendApproval) {
    throw new FinalDesignApprovalError(
      "Final design approval blocked: human reviewer did not recommend approval",
    );
  }
}
