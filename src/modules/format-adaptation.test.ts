import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_ADAPT_FORMAT_IDS,
  adaptFormatsToDesignSpecs,
  assertReadableTypeBudget,
  buildContentAdaptationItems,
  getFormatProfile,
  listFormatProfiles,
} from "./format-adaptation.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import type { ApprovedCopy } from "../schemas/approved-copy.js";
import type { BrandProfile } from "../schemas/brand-profile.js";
import type { Concept } from "../schemas/concept.js";
import type { DesignBrief } from "../schemas/design-brief.js";

const now = "2026-09-08T05:00:00.000Z";

const approvedCopy: ApprovedCopy = {
  schemaVersion: SCHEMA_VERSION,
  id: "copy-1",
  createdAt: now,
  updatedAt: now,
  headline: "Open Studio Night — A Very Long Headline That Overflows Small Formats Easily",
  subhead: "See the work. Meet the makers. Stay for a drink and a tour of the benches.",
  body: "Join us Friday for demos, new pieces on the wall, and a calm evening in the studio with the people who make the work. Bring a friend. Ask questions. Leave with a clearer sense of the craft.",
  callToAction: "RSVP today",
  lockedLines: { legal: "Ages 18+" },
  claims: [
    {
      id: "claim-phone-1",
      kind: "contact",
      text: "+1 555 0100",
      sourceLabel: "CRM",
      approvalRecordId: "apr-contact-1",
    },
    {
      id: "claim-email-1",
      kind: "contact",
      text: "hello@studionorth.example",
      sourceLabel: "CRM",
      approvalRecordId: "apr-contact-2",
    },
  ],
  approvalRecordId: "apr-copy-1",
  approvalStatus: "approved",
};

const brief: DesignBrief = {
  schemaVersion: SCHEMA_VERSION,
  id: "brief-1",
  createdAt: now,
  updatedAt: now,
  title: "Open Studio Night",
  offer: "Evening of live demos and new work",
  audience: {
    primary: "Local creatives",
    demographicsNotes: [],
    psychographicsNotes: [],
  },
  buyingContext: {
    stage: "solution_aware",
    setting: "Neighborhood walk-by",
    objections: [],
    competitors: [],
  },
  objective: "Drive RSVPs",
  oneMessageStatement: "Studio North is open Friday — come see new work",
  desiredAction: "RSVP today",
  prohibitedClaims: [],
  channel: "print_poster",
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
    printer: { required: true, notes: [] },
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
    moodKeywords: ["warm"],
    preferredPaletteHints: [],
    typographyHints: [],
    imageryHints: [],
    doPrefer: [],
    doAvoid: [],
    referenceUrls: [],
    notes: [],
  },
  approvedCopy,
  supportedClaims: [],
  briefApprovalRecordId: "apr-brief-1",
};

const brand: BrandProfile = {
  schemaVersion: SCHEMA_VERSION,
  id: "brand-1",
  createdAt: now,
  updatedAt: now,
  brandName: "Studio North",
  voice: {
    tone: ["polished", "confident", "human", "clear", "sales-focused"],
    doSay: [],
    dontSay: ["revolutionary"],
    banHype: true,
    neverInventFacts: true,
  },
  colors: [{ role: "primary", hex: "#1A1A1A" }],
  fonts: [],
  logoRules: {
    allowedBackgrounds: [],
    forbiddenTreatments: ["stretch"],
    mustRemainIntact: true,
  },
  assets: [],
  logos: [],
  certifications: [],
  licenseRecords: [],
  brandApprovalRecordId: "apr-brand-1",
  hardConstraints: {
    mustUsePrimaryLogo: false,
    mustUseBrandColors: true,
    forbiddenImagery: [],
  },
  creativePreferences: { moodKeywords: [], layoutNotes: [] },
};

const concept: Concept = {
  schemaVersion: SCHEMA_VERSION,
  id: "concept-a",
  createdAt: now,
  updatedAt: now,
  status: "selected",
  medium: "text_only",
  oneSentenceIdea: "An open studio door turns Friday into a low-pressure visit.",
  governingIdea: "An open studio door turns Friday into a low-pressure visit.",
  governingIdeaKey: "threshold",
  audienceInsight: "Visitors want an easy reason to walk in.",
  semanticConnection: "Open door = open studio",
  intendedEmotion: "Welcome",
  messageHierarchy: {
    primary: "Headline",
    secondary: "Place/time",
    exit: "RSVP",
  },
  typographyBehavior: {
    behavior: "Bold display then quiet CTA",
    displayRole: "Display",
    pairingNotes: "Quiet sans",
    caseTreatment: "as_written",
    weightContrast: "high",
    brandFontRolesUsed: ["display", "body"],
  },
  imageStrategy: {
    approach: "Threshold photo",
    metaphorKey: "open_door",
    metaphorDescription: "Door ajar",
    dependsOnReference: false,
  },
  likelyMisconception: "Real-estate open house",
  productionRisks: ["Metaphor confusion"],
  distinctivenessHypothesis: "Threshold photos are uncommon at poster scale locally",
  styleAxis: "environment_atmosphere",
  references: [],
  selectionReason: "Clear visit trigger",
  briefId: "brief-1",
  brandId: "brand-1",
};

describe("format profiles", () => {
  it("defines all five formats with required adaptation fields", () => {
    assert.deepEqual(ALL_ADAPT_FORMAT_IDS.sort(), [
      "business_card",
      "email_header",
      "one_page_flyer",
      "poster",
      "social_post",
    ]);
    for (const profile of listFormatProfiles()) {
      assert.ok(profile.viewingDistance);
      assert.ok(profile.primaryMessageRole);
      assert.ok(profile.secondaryMessageRole);
      assert.ok(profile.ctaPriority);
      assert.ok(profile.minimumTypeSize.headlinePt > 0);
      assert.ok(profile.safeArea);
      assert.ok(profile.logoBehavior);
      assert.ok(profile.imageCropBehavior);
      assert.ok(profile.qrCodePlacement);
      assert.ok(profile.requiredContactFields.length >= 1);
      assert.ok(profile.exportRequirements.formats.length >= 1);
      assert.ok(profile.compositionThesis.length > 20);
    }
  });

  it("uses distinct composition theses (not resize language)", () => {
    const theses = listFormatProfiles().map((p) => p.compositionThesis.toLowerCase());
    for (const t of theses) {
      assert.equal(t.includes("resize"), false);
    }
    const dims = new Set(
      listFormatProfiles().map((p) => `${p.dimensions.width}x${p.dimensions.height}${p.dimensions.unit}`),
    );
    assert.equal(dims.size, 5);
  });
});

describe("adaptFormatsToDesignSpecs", () => {
  it("creates a separate DesignSpec per format with shared governing idea and brand", () => {
    const result = adaptFormatsToDesignSpecs({
      brief,
      brand,
      concept,
      approvedCopy,
      now,
    });
    assert.equal(result.specs.length, 5);
    assert.equal(result.reports.length, 5);
    for (const spec of result.specs) {
      assert.equal(spec.governingIdea, concept.oneSentenceIdea);
      assert.equal(spec.brandId, brand.id);
      assert.equal(spec.conceptId, concept.id);
      assert.equal(spec.adaptationFamilyId, result.familyId);
      assert.equal(spec.hardConstraints.formatId, spec.formatId);
      assert.ok(
        spec.productionNotes.some((n) => n.includes("never silently shrink")),
      );
    }
    const formatIds = result.specs.map((s) => s.formatId).sort();
    assert.deepEqual(formatIds, [...ALL_ADAPT_FORMAT_IDS].sort());
  });

  it("reports shorten/remove/rewrite instead of silent shrink for overflowing copy", () => {
    const result = adaptFormatsToDesignSpecs({
      brief,
      brand,
      concept,
      approvedCopy,
      formats: ["business_card", "email_header"],
      now,
    });
    assert.equal(result.blockedOnCopyApproval, true);
    const card = result.reports.find((r) => r.formatId === "business_card")!;
    assert.ok(card.items.some((i) => i.field === "headline" && i.action !== "keep"));
    assert.ok(card.items.some((i) => i.field === "body" && i.action === "remove"));
    assert.equal(card.blockedOnCopyApproval, true);

    const email = result.reports.find((r) => r.formatId === "email_header")!;
    assert.ok(email.items.some((i) => i.action === "remove" || i.action === "shorten" || i.action === "rewrite"));
  });

  it("keeps fitting poster headline when within budget", () => {
    const shortCopy: ApprovedCopy = {
      ...approvedCopy,
      headline: "Open Studio Night",
      subhead: "Friday evening",
      body: undefined,
    };
    const items = buildContentAdaptationItems(getFormatProfile("poster"), shortCopy);
    const headline = items.find((i) => i.field === "headline");
    assert.equal(headline?.action, "keep");
  });

  it("refuses proposed type below format minimum", () => {
    assert.throws(() =>
      assertReadableTypeBudget({
        text: "Open Studio Night",
        maxChars: 42,
        minimumPt: 72,
        proposedPt: 18,
      }),
    );
  });
});
