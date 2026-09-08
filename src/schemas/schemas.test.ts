import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ApprovalRecordSchema,
  ApprovedCopySchema,
  AssetManifestSchema,
  BrandProfileSchema,
  ConceptSchema,
  CritiqueSchema,
  DesignBriefSchema,
  DesignSpecSchema,
  PreflightReportSchema,
  RenderResultSchema,
  SCHEMA_VERSION,
  assertBriefIntegrity,
  findUnsupportedFactualStrings,
  IntegrityError,
} from "./index.js";

const now = "2026-09-08T03:40:00.000Z";

const copyApproval = ApprovalRecordSchema.parse({
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
});

const briefApproval = ApprovalRecordSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  id: "apr-brief-1",
  createdAt: now,
  updatedAt: now,
  subject: "brief",
  subjectId: "brief-1",
  status: "approved",
  approvedBy: "operator@example.com",
  approvedAt: now,
  notes: [],
});

const priceApproval = ApprovalRecordSchema.parse({
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
});

const contactApproval = ApprovalRecordSchema.parse({
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
});

const logoApproval = ApprovalRecordSchema.parse({
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
});

const brandApproval = ApprovalRecordSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  id: "apr-brand-1",
  createdAt: now,
  updatedAt: now,
  subject: "brand",
  subjectId: "brand-1",
  status: "approved",
  approvedBy: "brand@example.com",
  approvedAt: now,
  notes: [],
});

function validCopy() {
  return ApprovedCopySchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "copy-1",
    createdAt: now,
    updatedAt: now,
    headline: "Open Studio Night",
    subhead: "See the work. Meet the makers.",
    callToAction: "RSVP today",
    lockedLines: { legal: "Ages 18+" },
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
  });
}

function validBrief() {
  return DesignBriefSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "brief-1",
    createdAt: now,
    updatedAt: now,
    title: "M1 poster brief",
    offer: "Open studio night with live maker demos",
    audience: { primary: "Local creatives 25–45", demographicsNotes: [], psychographicsNotes: [] },
    buyingContext: {
      stage: "solution_aware",
      setting: "Gallery walk-by and Instagram",
      objections: [],
      competitors: [],
    },
    objective: "Drive RSVPs to open studio night",
    oneMessageStatement: "Come see new work this Friday.",
    desiredAction: "RSVP via the link on the poster",
    prohibitedClaims: ["guaranteed sales", "best gallery in the world"],
    channel: "print_poster",
    hardConstraints: {
      mustIncludeText: ["Open Studio Night", "RSVP today"],
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
    creativePreferences: {
      moodKeywords: ["warm", "inviting"],
      preferredPaletteHints: [],
      typographyHints: ["expressive display"],
      imageryHints: ["studio interior"],
      doPrefer: [],
      doAvoid: ["stock handshake photos"],
      referenceUrls: [],
      notes: [],
    },
    approvedCopy: validCopy(),
    supportedClaims: [],
    briefApprovalRecordId: "apr-brief-1",
  });
}

describe("schema version", () => {
  it("locks SCHEMA_VERSION to 1", () => {
    assert.equal(SCHEMA_VERSION, 1);
  });
});

describe("ApprovalRecord", () => {
  it("rejects approved status without approvedBy/approvedAt", () => {
    assert.throws(() =>
      ApprovalRecordSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "apr-x",
        createdAt: now,
        updatedAt: now,
        subject: "copy",
        subjectId: "c1",
        status: "approved",
        notes: [],
      }),
    );
  });

  it("accepts pending without approver", () => {
    const rec = ApprovalRecordSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "apr-pending",
      createdAt: now,
      updatedAt: now,
      subject: "copy",
      subjectId: "c1",
      status: "pending",
      notes: [],
    });
    assert.equal(rec.status, "pending");
  });
});

describe("ApprovedCopy", () => {
  it("requires approvalStatus approved and claim approvals", () => {
    const copy = validCopy();
    assert.equal(copy.approvalStatus, "approved");
    assert.equal(copy.claims.length, 2);
  });

  it("rejects non-approved copy status", () => {
    assert.throws(() =>
      ApprovedCopySchema.parse({
        ...validCopy(),
        approvalStatus: "pending",
      }),
    );
  });
});

describe("DesignBrief", () => {
  it("parses a complete poster brief with separated hard/creative fields", () => {
    const brief = validBrief();
    assert.equal(brief.hardConstraints.formatId, "poster");
    assert.ok(brief.creativePreferences.moodKeywords.includes("warm"));
    assert.notDeepEqual(
      Object.keys(brief.hardConstraints).sort(),
      Object.keys(brief.creativePreferences).sort(),
    );
  });

  it("rejects channel/format mismatch", () => {
    assert.throws(() =>
      DesignBriefSchema.parse({
        ...validBrief(),
        channel: "print_business_card",
      }),
    );
  });
});

describe("integrity guards", () => {
  it("accepts brief when all approvals present", () => {
    assert.doesNotThrow(() =>
      assertBriefIntegrity(validBrief(), [
        copyApproval,
        briefApproval,
        priceApproval,
        contactApproval,
      ]),
    );
  });

  it("rejects missing copy approval", () => {
    assert.throws(
      () => assertBriefIntegrity(validBrief(), [briefApproval, priceApproval, contactApproval]),
      (err: unknown) => err instanceof IntegrityError && err.code === "unapproved_copy",
    );
  });

  it("rejects unsupported price on-design text", () => {
    const suspects = findUnsupportedFactualStrings(
      ["Special offer $99.00 tonight only"],
      ["Free entry", "+1 555 0100"],
    );
    assert.ok(suspects.length >= 1);
  });

  it("allows approved claim text through heuristic", () => {
    const suspects = findUnsupportedFactualStrings(
      ["Free entry", "+1 555 0100"],
      ["Free entry", "+1 555 0100"],
    );
    assert.deepEqual(suspects, []);
  });
});

describe("BrandProfile + AssetManifest", () => {
  it("rejects logo without approval", () => {
    assert.throws(() =>
      BrandProfileSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "brand-1",
        createdAt: now,
        updatedAt: now,
        brandName: "Studio North",
        voice: {
          tone: ["polished", "confident", "human", "clear", "sales-focused"],
          doSay: [],
          dontSay: [],
          banHype: true,
          neverInventFacts: true,
        },
        colors: [{ role: "primary", hex: "#1A1A1A" }],
        fonts: [],
        logos: [{ assetId: "asset-logo-1", approvalRecordId: " ", usage: "primary" }],
        certifications: [],
        assets: [],
        licenseRecords: [],
        brandApprovalRecordId: "apr-brand-1",
      }),
    );
  });

  it("accepts brand profile with fixed logo, license, and variation bounds", () => {
    const brand = BrandProfileSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "brand-1",
      createdAt: now,
      updatedAt: now,
      brandName: "Studio North",
      voice: {
        tone: ["polished", "confident", "human", "clear", "sales-focused"],
        doSay: ["Clear next step"],
        dontSay: ["revolutionary"],
        banHype: true,
        neverInventFacts: true,
      },
      colors: [{ role: "primary", hex: "#1A1A1A" }],
      fonts: [{ role: "headline", family: "Source Serif 4", fallbackStack: ["Georgia"], licensed: true }],
      logoRules: {
        primaryAssetId: "asset-logo-1",
        minClearSpace: { value: 0.25, unit: "in" },
        minReproductionSize: { value: 0.5, unit: "in" },
        allowedBackgrounds: ["white", "charcoal"],
        forbiddenTreatments: ["stretch", "recolor_off_brand"],
        mustRemainIntact: true,
      },
      imageStyle: {
        description: "Documentary studio light, real workspaces",
        subjectMatter: ["tools", "hands at work"],
        doPrefer: ["natural light"],
        doAvoid: ["stock handshakes"],
      },
      logos: [{ assetId: "asset-logo-1", approvalRecordId: "apr-logo-1", usage: "primary" }],
      assets: [
        {
          assetId: "asset-logo-1",
          label: "Primary mark",
          kind: "logo",
          classes: ["fixed", "approval_required"],
          permittedVariation: [],
          licenseRecordId: "lic-logo-1",
          approvalRecordId: "apr-logo-1",
          localPath: "brand/logo.svg",
        },
        {
          assetId: "asset-photo-1",
          label: "Studio hero photo",
          kind: "photo",
          classes: ["variable", "distinctive"],
          permittedVariation: ["crop", "grade within brand contrast"],
          licenseRecordId: "lic-photo-1",
          localPath: "brand/studio.jpg",
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
        {
          id: "lic-photo-1",
          assetId: "asset-photo-1",
          owner: "Studio North",
          licenseType: "owned",
          licenseLabel: "Staff photo",
          commercialUseAllowed: true,
          modificationAllowed: true,
          attributionRequired: false,
          notes: [],
        },
      ],
      certifications: [],
      brandApprovalRecordId: "apr-brand-1",
    });
    assert.equal(brand.assets.length, 2);
    void logoApproval;
    void brandApproval;
  });

  it("accepts approved logo asset in manifest", () => {
    const manifest = AssetManifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "assets-1",
      createdAt: now,
      updatedAt: now,
      jobId: "job-1",
      assets: [
        {
          id: "asset-logo-1",
          kind: "logo",
          label: "Primary mark",
          localPath: "brand/logo.svg",
          approvalRecordId: "apr-logo-1",
          licenseRecordId: "lic-logo-1",
          provenance: {
            origin: "client_supplied",
            notes: [],
          },
        },
      ],
      licenses: [
        {
          id: "lic-logo-1",
          assetId: "asset-logo-1",
          owner: "Studio North",
          licenseType: "owned",
          licenseLabel: "Work for hire",
          commercialUseAllowed: true,
          modificationAllowed: true,
          attributionRequired: false,
          notes: [],
        },
      ],
    });
    assert.equal(manifest.assets[0]?.kind, "logo");
    assert.equal(manifest.licenses.length, 1);
  });
});

describe("Concept", () => {
  it("requires all creative fields and rejectionReason when rejected", () => {
    const concept = ConceptSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "concept-a",
      createdAt: now,
      updatedAt: now,
      status: "proposed",
      medium: "text_only",
      oneSentenceIdea: "A warm doorway invites neighbors into the studio.",
      governingIdea: "A warm doorway invites neighbors into the studio.",
      governingIdeaKey: "threshold",
      audienceInsight: "Visitors want a low-pressure reason to walk in this week.",
      semanticConnection: "Open door = open studio night",
      intendedEmotion: "Curiosity and welcome",
      messageHierarchy: {
        primary: "Headline",
        secondary: "Date/place line",
        exit: "RSVP CTA",
      },
      typographyBehavior: {
        behavior: "Expressive display then quiet utilitarian CTA",
        displayRole: "Expressive serif for headline",
        pairingNotes: "Quiet sans for CTA",
        caseTreatment: "as_written",
        weightContrast: "high",
        brandFontRolesUsed: ["display", "body"],
      },
      imageStrategy: {
        approach: "Single photographic threshold with soft interior light",
        metaphorKey: "open_door",
        metaphorDescription: "Door ajar into a lit studio",
        dependsOnReference: false,
      },
      likelyMisconception: "May read as a real-estate open house",
      productionRisks: ["Door metaphor may read as real-estate ad"],
      distinctivenessHypothesis:
        "Local galleries rarely use threshold photography at poster scale",
      styleAxis: "environment_atmosphere",
      references: [],
      briefId: "brief-1",
      brandId: "brand-1",
    });
    assert.equal(concept.oneSentenceIdea.length > 0, true);

    assert.throws(() =>
      ConceptSchema.parse({
        ...concept,
        status: "rejected",
      }),
    );
  });
});

describe("DesignSpec + RenderResult", () => {
  it("keeps hardConstraints separate from creativePreferences", () => {
    const brief = validBrief();
    const spec = DesignSpecSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "spec-1",
      createdAt: now,
      updatedAt: now,
      briefId: brief.id,
      brandId: "brand-1",
      conceptId: "concept-a",
      approvedCopyId: "copy-1",
      formatId: "poster",
      governingIdea: "A warm doorway invites neighbors into the studio.",
      hardConstraints: brief.hardConstraints,
      creativePreferences: brief.creativePreferences,
      productionNotes: [],
      allowedClaimIds: ["claim-price-1", "claim-phone-1"],
      allowedAssetIds: ["asset-logo-1"],
    });
    assert.ok("formatId" in spec.hardConstraints);
    assert.ok("moodKeywords" in spec.creativePreferences);
  });

  it("requires designId, editUrl, candidateId, export on success", () => {
    assert.throws(() =>
      RenderResultSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "render-1",
        createdAt: now,
        updatedAt: now,
        designSpecId: "spec-1",
        formatId: "poster",
        designId: null,
        editUrl: null,
        candidateId: null,
        pageIds: [],
        transactionId: null,
        exportJobId: null,
        exportFormat: null,
        timestamps: {},
        toolVersions: { schemaVersion: SCHEMA_VERSION, toolsUsed: [] },
        failureState: { failed: false },
      }),
    );
  });

  it("accepts successful render with full MCP provenance", () => {
    const result = RenderResultSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "render-1",
      createdAt: now,
      updatedAt: now,
      designSpecId: "spec-1",
      formatId: "poster",
      designId: "DAGxxxxxxxx",
      editUrl: "https://www.canva.com/design/DAGxxxxxxxx/edit",
      candidateId: "candidate-1",
      pageIds: ["page-1"],
      transactionId: "TXN_1",
      exportJobId: "export-1",
      exportFormat: "png",
      timestamps: {
        generatedAt: now,
        createdFromCandidateAt: now,
        exportCompletedAt: now,
      },
      toolVersions: {
        schemaVersion: SCHEMA_VERSION,
        canvaDesignMcp: "mcp.canva.com",
        toolsUsed: ["generate-design", "create-design-from-candidate", "export-design"],
      },
      failureState: { failed: false },
    });
    assert.equal(result.failureState.failed, false);
    assert.ok(result.editUrl?.includes("canva.com"));
  });

  it("accepts failed render without inventing success fields", () => {
    const result = RenderResultSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "render-fail",
      createdAt: now,
      updatedAt: now,
      designSpecId: "spec-1",
      formatId: "poster",
      designId: null,
      editUrl: null,
      candidateId: null,
      pageIds: [],
      transactionId: null,
      exportJobId: null,
      exportFormat: null,
      timestamps: { generatedAt: now },
      toolVersions: { schemaVersion: SCHEMA_VERSION, toolsUsed: ["generate-design"] },
      failureState: {
        failed: true,
        code: "mcp_unavailable",
        message: "Canva Design MCP not connected",
        retryable: true,
        occurredAt: now,
      },
    });
    assert.equal(result.failureState.failed, true);
  });
});

describe("Critique + PreflightReport", () => {
  it("blocks pass when integrity violations exist", () => {
    const dims = [
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
    ].map((id) => ({
      id,
      score: 8,
      notes: "ok",
      findings: [],
    }));
    assert.throws(() =>
      CritiqueSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "crit-1",
        createdAt: now,
        updatedAt: now,
        renderResultId: "render-1",
        designSpecId: "spec-1",
        designId: null,
        candidateId: null,
        designVersion: "v1",
        overallScore: 9,
        passThreshold: 7,
        dimensions: dims,
        findings: [],
        revisionInstructions: [],
        integrityViolations: [
          {
            kind: "fabricated_contact",
            detail: "Phone not in approved claims",
            observedText: "+1 555 9999",
          },
        ],
        decision: "pass",
        revisionsRemaining: 2,
        humanReviewRequired: false,
      }),
    );
  });

  it("requires fail outcome when hard checks fail", () => {
    assert.throws(() =>
      PreflightReportSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "pf-1",
        createdAt: now,
        updatedAt: now,
        renderResultId: "render-1",
        designSpecId: "spec-1",
        checks: [
          {
            id: "must-include-headline",
            category: "copy",
            status: "fail",
            severity: "blocker",
            message: "Headline missing",
            hard: true,
            location: {},
            evidence: "Headline not in observedText",
            suggestedCorrection: "Add exact approved headline",
          },
        ],
        hardFailCount: 1,
        warnCount: 0,
        outcome: "pass",
        approvalAllowed: true,
        observedText: [],
        summary: "bad",
      }),
    );
  });

  it("accepts fail preflight with matching counts", () => {
    const report = PreflightReportSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: "pf-1",
      createdAt: now,
      updatedAt: now,
      renderResultId: "render-1",
      designSpecId: "spec-1",
      checks: [
        {
          id: "must-include-headline",
          category: "copy",
          status: "fail",
          severity: "blocker",
          message: "Headline missing",
          hard: true,
          location: {},
          evidence: "Headline not observed",
          suggestedCorrection: "Place exact approved headline",
        },
        {
          id: "mood-warmth",
          category: "other",
          status: "warn",
          severity: "minor",
          message: "Palette cooler than preference",
          hard: false,
          location: {},
          evidence: "Creative preference only",
          suggestedCorrection: "Optional palette tweak",
        },
      ],
      hardFailCount: 1,
      warnCount: 1,
      outcome: "fail",
      approvalAllowed: false,
      printReady: false,
      observedText: ["Wrong headline"],
      summary: "Failed copy check",
    });
    assert.equal(report.outcome, "fail");
  });
});
