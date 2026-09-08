import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApprovalRecordSchema, SCHEMA_VERSION } from "../schemas/index.js";
import { validateAndNormalizeIntake } from "./intake.js";
import { findHypeLanguage } from "../lib/voice.js";

const now = "2026-09-08T03:40:00.000Z";

const approvals = [
  ApprovalRecordSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "apr-copy-1",
    createdAt: now,
    updatedAt: now,
    subject: "copy",
    subjectId: "copy-1",
    status: "approved",
    approvedBy: "operator@example.com",
    approvedAt: now,
    notes: [],
  }),
  ApprovalRecordSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "apr-brief-1",
    createdAt: now,
    updatedAt: now,
    subject: "brief",
    subjectId: "intake-1",
    status: "approved",
    approvedBy: "operator@example.com",
    approvedAt: now,
    notes: [],
  }),
  ApprovalRecordSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "apr-brand-1",
    createdAt: now,
    updatedAt: now,
    subject: "brand",
    subjectId: "brand-studio-north",
    status: "approved",
    approvedBy: "brand@example.com",
    approvedAt: now,
    notes: [],
  }),
  ApprovalRecordSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "apr-logo-1",
    createdAt: now,
    updatedAt: now,
    subject: "logo",
    subjectId: "asset-logo-1",
    status: "approved",
    approvedBy: "brand@example.com",
    approvedAt: now,
    notes: [],
  }),
  ApprovalRecordSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "apr-price-1",
    createdAt: now,
    updatedAt: now,
    subject: "price",
    subjectId: "claim-price-1",
    status: "approved",
    approvedBy: "finance@example.com",
    approvedAt: now,
    notes: [],
  }),
  ApprovalRecordSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "apr-contact-1",
    createdAt: now,
    updatedAt: now,
    subject: "contact",
    subjectId: "claim-phone-1",
    status: "approved",
    approvedBy: "ops@example.com",
    approvedAt: now,
    notes: [],
  }),
];

function baseIntake(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "intake-1",
    createdAt: now,
    updatedAt: now,
    organizationName: "Studio North",
    title: "Open Studio Night",
    offer: "An evening of live demos and new work from resident makers",
    whoNeedsIt: {
      primaryAudience: "Local creatives and collectors",
      demographicsNotes: [],
      psychographicsNotes: [],
    },
    purchaseTrigger: {
      situation: "Looking for a low-friction way to visit the studio this week",
      stage: "solution_aware",
      objections: [],
      competitors: [],
    },
    twoSecondUnderstanding: "Studio North is open Friday — come see new work",
    nextAction: "RSVP with your name and guest count",
    copyAndClaims: {
      approvedCopy: {
        schemaVersion: SCHEMA_VERSION,
        id: "copy-1",
        createdAt: now,
        updatedAt: now,
        headline: "Open Studio Night",
        subhead: "See the work. Meet the makers.",
        callToAction: "RSVP today",
        lockedLines: {},
        claims: [
          {
            id: "claim-price-1",
            kind: "price",
            text: "Free entry",
            sourceLabel: "Event brief v2",
            approvalRecordId: "apr-price-1",
          },
          {
            id: "claim-phone-1",
            kind: "contact",
            text: "+1 555 0100",
            sourceLabel: "CRM primary phone",
            approvalRecordId: "apr-contact-1",
          },
        ],
        approvalRecordId: "apr-copy-1",
        approvalStatus: "approved",
      },
      prohibitedClaims: ["best gallery in the world", "guaranteed collector sales"],
      supportedClaims: [],
    },
    brandAssets: {
      brandName: "Studio North",
      brandApprovalRecordId: "apr-brand-1",
      colors: [{ role: "primary", hex: "#1A1A1A" }],
      fonts: [],
      logos: [{ assetId: "asset-logo-1", approvalRecordId: "apr-logo-1", usage: "primary" }],
      logoRules: {
        primaryAssetId: "asset-logo-1",
        minClearSpace: { value: 0.25, unit: "in" },
        allowedBackgrounds: ["white"],
        forbiddenTreatments: ["stretch"],
        mustRemainIntact: true,
      },
      imageStyle: {
        description: "Real studio spaces, natural light",
        subjectMatter: ["workbenches"],
        doPrefer: [],
        doAvoid: ["stock handshakes"],
      },
      assets: [
        {
          assetId: "asset-logo-1",
          label: "Primary mark",
          kind: "logo",
          classes: ["fixed", "approval_required", "distinctive"],
          permittedVariation: [],
          licenseRecordId: "lic-logo-1",
          approvalRecordId: "apr-logo-1",
          localPath: "brand/logo.svg",
        },
      ],
      licenseRecords: [
        {
          id: "lic-logo-1",
          assetId: "asset-logo-1",
          owner: "Studio North",
          licenseType: "owned",
          licenseLabel: "In-house mark",
          commercialUseAllowed: true,
          modificationAllowed: false,
          attributionRequired: false,
          notes: [],
        },
      ],
      distinctivenessAudit: {
        schemaVersion: SCHEMA_VERSION,
        id: "da-1",
        createdAt: now,
        updatedAt: now,
        brandId: "intake-1-brand",
        brandName: "Studio North",
        audienceSummary: "Local creatives and collectors",
        findings: [
          {
            assetId: "asset-logo-1",
            assetLabel: "Primary mark",
            recognitionHypothesis: {
              statement: "Viewers will recognize the mark from neighborhood signage",
              believedRecognized: true,
              confidence: "low",
              evidenceStatus: "hypothesis",
              evidenceNotes: [],
            },
            uniqueAssociationHypothesis: {
              statement: "Viewers will link the mark to Studio North, not a generic atelier",
              believedUniqueToBrand: true,
              confidence: "low",
              evidenceStatus: "hypothesis",
              evidenceNotes: [],
              confusionRisks: ["Generic craft-studio monograms"],
            },
            productionRecommendation: "test_before_scale",
          },
        ],
        overallNotes: [],
      },
    },
    outputs: [
      {
        formatId: "poster",
        channel: "print_poster",
        label: "Poster",
        hardConstraints: {
          mustIncludeText: [],
          mustExcludeText: [],
          formatId: "poster",
          dimensions: { width: 18, height: 24, unit: "in" },
          localization: { locale: "en-US", language: "en", rtl: false },
          accessibility: {
            minContrastRatio: 4.5,
            altTextRequired: true,
            colorBlindSafe: false,
            notes: [],
          },
          printer: {
            required: true,
            bleedInches: 0.125,
            safeMarginInches: 0.25,
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
      },
      {
        formatId: "business_card",
        channel: "print_business_card",
        label: "Business card",
        hardConstraints: {
          mustIncludeText: [],
          mustExcludeText: [],
          formatId: "business_card",
          dimensions: { width: 3.5, height: 2, unit: "in" },
          localization: { locale: "en-US", language: "en", rtl: false },
          accessibility: {
            minContrastRatio: 4.5,
            altTextRequired: true,
            colorBlindSafe: false,
            notes: [],
          },
          printer: {
            required: true,
            bleedInches: 0.125,
            safeMarginInches: 0.125,
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
      },
    ],
    briefApprovalRecordId: "apr-brief-1",
    ...overrides,
  };
}

describe("voice", () => {
  it("flags hype without inventing replacements", () => {
    const issues = findHypeLanguage("Our revolutionary open night", "offer");
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.excerpt, /revolutionary/i);
  });
});

describe("validateAndNormalizeIntake", () => {
  it("maps eight intake areas into briefs + brand profile", () => {
    const result = validateAndNormalizeIntake(baseIntake(), approvals, {
      now,
      jobId: "intake-1",
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
    assert.equal(result.briefs.length, 2);
    assert.ok(result.brandProfile);
    assert.equal(result.briefs[0]!.offer.includes("live demos"), true);
    assert.equal(result.briefs[0]!.oneMessageStatement.includes("Friday"), true);
    assert.equal(result.briefs[0]!.desiredAction.startsWith("RSVP"), true);
    assert.ok(result.briefs[0]!.prohibitedClaims.length >= 1);
    assert.equal(result.brandProfile!.logoRules.primaryAssetId, "asset-logo-1");
    assert.ok(result.distinctivenessAudit);
    assert.equal(
      result.distinctivenessAudit!.findings[0]!.recognitionHypothesis.evidenceStatus,
      "hypothesis",
    );
    const soft = result.issues.filter((i) => i.code === "distinctiveness" && !i.hard);
    assert.ok(soft.length >= 1);
  });

  it("rejects hype when banHype is on", () => {
    const raw = baseIntake({
      offer: "A revolutionary night of guaranteed results",
    });
    const result = validateAndNormalizeIntake(raw, approvals, { now });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "hype_language" && i.hard));
  });

  it("rejects prohibited language inside approved copy", () => {
    const raw = baseIntake();
    (raw as { copyAndClaims: { approvedCopy: { headline: string } } }).copyAndClaims.approvedCopy.headline =
      "best gallery in the world opens Friday";
    const result = validateAndNormalizeIntake(raw, approvals, { now });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "prohibited_in_copy"));
  });

  it("rejects missing approvals", () => {
    const result = validateAndNormalizeIntake(baseIntake(), [], { now });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "missing_approval" || i.code === "integrity"));
  });

  it("rejects use_as_signature without tested distinctiveness", () => {
    const raw = baseIntake();
    const audit = (
      raw as {
        brandAssets: {
          distinctivenessAudit: {
            findings: Array<{ productionRecommendation: string }>;
          };
        };
      }
    ).brandAssets.distinctivenessAudit;
    audit.findings[0]!.productionRecommendation = "use_as_signature";
    const result = validateAndNormalizeIntake(raw, approvals, { now });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "schema"));
  });
});
