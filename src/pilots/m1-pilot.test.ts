import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertFinalDesignApprovalAllowed,
  FinalDesignApprovalError,
} from "./failure-remediation.js";
import { runM1Pilot } from "./run-m1-pilot.js";
import { PILOT_NOW } from "./studio-north-fixture.js";

describe("M1 Studio North pilot evaluation", () => {
  it("produces poster + business card packages with baseline comparison", async () => {
    const root = await mkdtemp(join(tmpdir(), "gds-pilot-"));
    try {
      const report = await runM1Pilot({
        rootDir: root,
        now: PILOT_NOW,
        correlationId: "corr_pilot_test",
        liveClient: null,
      });

      assert.equal(report.packages.length, 2);
      assert.ok(report.packages.some((p) => p.formatId === "poster"));
      assert.ok(report.packages.some((p) => p.formatId === "business_card"));
      assert.equal(report.overallStatus, "complete_blocked_pending_live_canva");
      assert.equal(report.agentExpansionRecommendation.addAgents, false);
      assert.ok(report.failures.some((f) => f.id === "F001"));
      assert.ok(
        report.failures.some((f) => f.id.startsWith("F-cta-contrast-")),
      );
      assert.ok(
        report.failures.some(
          (f) => f.convertedInto?.reference === "assertFinalDesignApprovalAllowed",
        ),
      );
      assert.ok(
        report.failures.some(
          (f) => f.convertedInto?.reference === "assertBrandCtaContrast",
        ),
      );

      for (const pkg of report.packages) {
        assert.equal(pkg.selectedConceptIds.length, 2);
        assert.ok(pkg.designId?.startsWith("PILOT_MOCK_"));
        assert.ok(pkg.editUrl);
        assert.equal(pkg.exportProofed, true);
        assert.equal(pkg.finalApproval.status, "pending");
        assert.equal(pkg.canvaProvenance.source, "pilot_harness_mock");
        assert.equal(pkg.systemScores.revisionCount, 1);
        assert.ok(pkg.comparison.length >= 7);
        assert.ok(pkg.comparison.every((c) => typeof c.systemWins === "boolean"));
        assert.ok(pkg.humanReviewNotes.ctaComprehension.includes("RSVP"));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks final approval without live Design MCP provenance", () => {
    assert.throws(
      () =>
        assertFinalDesignApprovalAllowed({
          canvaProvenance: {
            source: "pilot_harness_mock",
            discoveredToolCount: 0,
            note: "mock",
            recordedAt: PILOT_NOW,
          },
          designId: "PILOT_MOCK_POSTER",
          editUrl: "https://www.canva.com/design/PILOT_MOCK_POSTER/edit",
          exportProofed: true,
          humanRecommendApproval: true,
        }),
      (err: unknown) => err instanceof FinalDesignApprovalError,
    );
  });
});
