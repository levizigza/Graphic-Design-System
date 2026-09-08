import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio, WCAG_2_2_AA } from "../lib/contrast.js";
import { runPreflight } from "./preflight.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import type { ApprovedCopy } from "../schemas/approved-copy.js";
import type { BrandProfile } from "../schemas/brand-profile.js";
import type { DesignSpec } from "../schemas/design-spec.js";

const now = "2026-09-08T06:00:00.000Z";

const approvedCopy: ApprovedCopy = {
  schemaVersion: SCHEMA_VERSION,
  id: "copy-1",
  createdAt: now,
  updatedAt: now,
  headline: "Open Studio Night",
  callToAction: "RSVP today",
  lockedLines: {},
  claims: [
    {
      id: "claim-phone-1",
      kind: "contact",
      text: "+1 555 0100",
      sourceLabel: "CRM",
      approvalRecordId: "apr-c",
    },
  ],
  approvalRecordId: "apr-copy-1",
  approvalStatus: "approved",
};

const brand: BrandProfile = {
  schemaVersion: SCHEMA_VERSION,
  id: "brand-1",
  createdAt: now,
  updatedAt: now,
  brandName: "Studio North",
  voice: {
    tone: ["clear"],
    doSay: [],
    dontSay: [],
    banHype: true,
    neverInventFacts: true,
  },
  colors: [{ role: "primary", hex: "#111111" }],
  fonts: [],
  logoRules: {
    primaryAssetId: "asset-logo-1",
    minClearSpace: { value: 0.25, unit: "in" },
    allowedBackgrounds: [],
    forbiddenTreatments: [],
    mustRemainIntact: true,
  },
  assets: [
    {
      assetId: "asset-logo-1",
      label: "Mark",
      kind: "logo",
      classes: ["fixed", "approval_required"],
      permittedVariation: [],
      licenseRecordId: "lic-1",
      approvalRecordId: "apr-logo",
      localPath: "brand/logo.svg",
    },
  ],
  logos: [{ assetId: "asset-logo-1", approvalRecordId: "apr-logo", usage: "primary" }],
  certifications: [],
  licenseRecords: [
    {
      id: "lic-1",
      assetId: "asset-logo-1",
      owner: "Studio North",
      licenseType: "owned",
      licenseLabel: "In-house",
      commercialUseAllowed: true,
      modificationAllowed: false,
      attributionRequired: false,
      notes: [],
    },
  ],
  brandApprovalRecordId: "apr-brand",
  hardConstraints: {
    mustUsePrimaryLogo: true,
    mustUseBrandColors: true,
    forbiddenImagery: [],
  },
  creativePreferences: { moodKeywords: [], layoutNotes: [] },
};

const printSpec: DesignSpec = {
  schemaVersion: SCHEMA_VERSION,
  id: "spec-poster",
  createdAt: now,
  updatedAt: now,
  briefId: "brief-1",
  brandId: "brand-1",
  conceptId: "concept-a",
  approvedCopyId: "copy-1",
  formatId: "poster",
  governingIdea: "Open door invite",
  hardConstraints: {
    mustIncludeText: ["Open Studio Night", "RSVP today"],
    mustExcludeText: ["guaranteed results"],
    formatId: "poster",
    dimensions: { width: 18, height: 24, unit: "in" },
    localization: { locale: "en-US", language: "en", rtl: false },
    accessibility: {
      minContrastRatio: 4.5,
      minBodyFontPt: 18,
      altTextRequired: true,
      colorBlindSafe: false,
      notes: [],
    },
    printer: {
      required: true,
      bleedInches: 0.125,
      safeMarginInches: 0.5,
      colorMode: "cmyk",
      notes: [],
    },
    requireApprovalFor: [
      "copy",
      "price",
      "date",
      "testimonial",
      "logo",
      "certification",
      "contact",
      "claim",
    ],
  },
  creativePreferences: {
    moodKeywords: [],
    preferredPaletteHints: [],
    typographyHints: [],
    imageryHints: [],
    doPrefer: [],
    doAvoid: [],
    referenceUrls: [],
    notes: [],
  },
  productionNotes: [],
  allowedClaimIds: ["claim-phone-1"],
  allowedAssetIds: ["asset-logo-1"],
};

describe("contrast WCAG 2.2", () => {
  it("computes black on white above AA normal text", () => {
    const ratio = contrastRatio("#000000", "#FFFFFF");
    assert.ok(ratio >= WCAG_2_2_AA.normalText);
  });
});

describe("runPreflight", () => {
  it("blocks approval when design ID / edit URL missing", () => {
    const report = runPreflight({
      designSpec: printSpec,
      approvedCopy,
      brand,
      designId: null,
      editUrl: null,
      renderResultId: "render-1",
      observations: {
        observedText: ["Open Studio Night", "RSVP today", "+1 555 0100"],
        pageWidth: 18,
        pageHeight: 24,
        pageUnit: "in",
        usedAssetIds: ["asset-logo-1"],
        spellingSuspects: [],
        textBoxes: [
          {
            role: "headline",
            text: "Open Studio Night",
            fontSizePt: 72,
            boxWidth: 10,
            boxHeight: 2,
            contentWidth: 9,
            contentHeight: 1.5,
            foregroundHex: "#111111",
            backgroundHex: "#FFFFFF",
          },
          {
            role: "cta",
            text: "RSVP today",
            fontSizePt: 24,
            boxWidth: 4,
            boxHeight: 1,
            contentWidth: 3,
            contentHeight: 0.5,
            foregroundHex: "#111111",
            backgroundHex: "#FFFFFF",
          },
        ],
        logo: {
          clearSpaceActual: 0.3,
          clearSpaceRequired: 0.25,
          unit: "in",
        },
      },
      now,
    });
    assert.equal(report.outcome, "fail");
    assert.equal(report.approvalAllowed, false);
    assert.ok(report.checks.some((c) => c.id === "handoff-design-id" && c.status === "fail"));
    assert.ok(report.checks.some((c) => c.id === "handoff-edit-url" && c.status === "fail"));
    for (const fail of report.checks.filter((c) => c.status === "fail")) {
      assert.ok(fail.evidence.length > 0);
      assert.ok(fail.suggestedCorrection.length > 0);
      assert.notEqual(fail.severity, "info");
    }
  });

  it("never labels API PDF print-ready without verification", () => {
    const report = runPreflight({
      designSpec: printSpec,
      approvedCopy,
      brand,
      designId: "DAG123",
      editUrl: "https://www.canva.com/design/DAG123/edit",
      renderResultId: "render-1",
      outputKind: "print",
      observations: {
        observedText: ["Open Studio Night", "RSVP today"],
        pageWidth: 18,
        pageHeight: 24,
        pageUnit: "in",
        exportFormat: "pdf",
        usedAssetIds: ["asset-logo-1"],
        spellingSuspects: [],
        textBoxes: [
          {
            role: "headline",
            text: "Open Studio Night",
            fontSizePt: 72,
            boxWidth: 10,
            boxHeight: 2,
            contentWidth: 9,
            contentHeight: 1.5,
            foregroundHex: "#000000",
            backgroundHex: "#FFFFFF",
          },
          {
            role: "cta",
            text: "RSVP today",
            fontSizePt: 28,
            boxWidth: 4,
            boxHeight: 1,
            contentWidth: 3,
            contentHeight: 0.5,
            foregroundHex: "#000000",
            backgroundHex: "#FFFFFF",
          },
        ],
        logo: {
          clearSpaceActual: 0.3,
          clearSpaceRequired: 0.25,
          unit: "in",
        },
        // printVerification omitted on purpose
      },
      now,
    });
    assert.equal(report.printReady, false);
    assert.ok(report.printReadyBlockers.includes("bleed_verified"));
    assert.ok(
      report.checks.some(
        (c) =>
          c.category === "printer" &&
          c.status === "fail" &&
          c.suggestedCorrection.includes("print-ready"),
      ),
    );
  });

  it("passes when measurements, handoff, and print proofs are complete", () => {
    const report = runPreflight({
      designSpec: printSpec,
      approvedCopy,
      brand,
      designId: "DAG123",
      editUrl: "https://www.canva.com/design/DAG123/edit",
      renderResultId: "render-1",
      outputKind: "print",
      observations: {
        observedText: ["Open Studio Night", "RSVP today", "+1 555 0100"],
        pageWidth: 18,
        pageHeight: 24,
        pageUnit: "in",
        exportFormat: "pdf",
        usedAssetIds: ["asset-logo-1"],
        spellingSuspects: [],
        textBoxes: [
          {
            elementId: "EL1",
            role: "headline",
            text: "Open Studio Night",
            fontSizePt: 84,
            boxWidth: 12,
            boxHeight: 3,
            contentWidth: 11,
            contentHeight: 2,
            foregroundHex: "#000000",
            backgroundHex: "#FFFFFF",
          },
          {
            elementId: "EL2",
            role: "cta",
            text: "RSVP today",
            fontSizePt: 28,
            boxWidth: 5,
            boxHeight: 1,
            contentWidth: 4,
            contentHeight: 0.6,
            foregroundHex: "#000000",
            backgroundHex: "#FFFFFF",
          },
        ],
        logo: {
          elementId: "LOGO",
          clearSpaceActual: 0.4,
          clearSpaceRequired: 0.25,
          unit: "in",
        },
        images: [{ widthPx: 5400, heightPx: 7200, effectivePpi: 300, assetId: "asset-logo-1" }],
        qr: { present: false },
        printVerification: {
          bleedVerified: true,
          cropMarksVerified: true,
          colorProfileVerified: true,
          proofingVerified: true,
        },
      },
      now,
    });
    assert.equal(report.outcome === "pass" || report.outcome === "pass_with_warnings", true);
    assert.equal(report.approvalAllowed, true);
    assert.equal(report.printReady, true);
    assert.equal(report.contrastStandard, "custom_print");
  });

  it("fails low contrast under WCAG 2.2 AA for digital", () => {
    const digitalSpec: DesignSpec = {
      ...printSpec,
      id: "spec-social",
      formatId: "social_post",
      hardConstraints: {
        ...printSpec.hardConstraints,
        formatId: "social_post",
        dimensions: { width: 1080, height: 1350, unit: "px" },
        printer: { required: false, notes: [] },
        accessibility: {
          ...printSpec.hardConstraints.accessibility,
          minBodyFontPt: 14,
        },
      },
    };
    const report = runPreflight({
      designSpec: digitalSpec,
      approvedCopy,
      brand: { ...brand, hardConstraints: { ...brand.hardConstraints, mustUsePrimaryLogo: false } },
      designId: "DAG9",
      editUrl: "https://www.canva.com/design/DAG9/edit",
      renderResultId: "render-2",
      outputKind: "digital",
      digitalContrastLevel: "AA",
      observations: {
        observedText: ["Open Studio Night", "RSVP today"],
        pageWidth: 1080,
        pageHeight: 1350,
        pageUnit: "px",
        spellingSuspects: [],
        usedAssetIds: [],
        textBoxes: [
          {
            role: "headline",
            text: "Open Studio Night",
            fontSizePt: 32,
            boxWidth: 800,
            boxHeight: 120,
            contentWidth: 700,
            contentHeight: 100,
            foregroundHex: "#777777",
            backgroundHex: "#888888",
          },
          {
            role: "cta",
            text: "RSVP today",
            fontSizePt: 18,
            boxWidth: 300,
            boxHeight: 60,
            contentWidth: 250,
            contentHeight: 40,
            foregroundHex: "#000000",
            backgroundHex: "#FFFFFF",
          },
        ],
      },
      now,
    });
    assert.equal(report.contrastStandard, "wcag_2_2_aa");
    assert.ok(report.checks.some((c) => c.category === "contrast" && c.status === "fail"));
    assert.equal(report.approvalAllowed, false);
  });

  it("flags forbidden claims and type below minimum", () => {
    const report = runPreflight({
      designSpec: printSpec,
      approvedCopy,
      brand,
      designId: "DAG123",
      editUrl: "https://www.canva.com/design/DAG123/edit",
      renderResultId: "render-1",
      prohibitedClaims: ["guaranteed results"],
      observations: {
        observedText: ["Open Studio Night", "RSVP today", "guaranteed results"],
        pageWidth: 18,
        pageHeight: 24,
        pageUnit: "in",
        spellingSuspects: [],
        usedAssetIds: ["asset-logo-1"],
        textBoxes: [
          {
            role: "headline",
            text: "Open Studio Night",
            fontSizePt: 12,
            boxWidth: 10,
            boxHeight: 1,
            contentWidth: 11,
            contentHeight: 1.2,
            clipped: true,
            foregroundHex: "#000",
            backgroundHex: "#fff",
          },
        ],
        logo: {
          clearSpaceActual: 0.05,
          clearSpaceRequired: 0.25,
          unit: "in",
        },
      },
      now,
    });
    assert.ok(report.checks.some((c) => c.category === "claims" && c.status === "fail"));
    assert.ok(report.checks.some((c) => c.category === "type_size" && c.status === "fail"));
    assert.ok(report.checks.some((c) => c.category === "overflow" && c.status === "fail"));
    assert.ok(report.checks.some((c) => c.category === "logo" && c.status === "fail"));
  });
});
