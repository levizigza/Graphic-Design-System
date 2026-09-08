import type { ApprovedCopy } from "../schemas/approved-copy.js";
import type { BrandProfile } from "../schemas/brand-profile.js";
import type { Concept } from "../schemas/concept.js";
import type { DesignBrief } from "../schemas/design-brief.js";
import type { DesignSpec } from "../schemas/design-spec.js";
import { DesignSpecSchema } from "../schemas/design-spec.js";
import type {
  AdaptFormatId,
  ContentAdaptationItem,
  FormatAdaptationProfile,
  FormatAdaptationReport,
} from "../schemas/format-profile.js";
import { FormatAdaptationReportSchema } from "../schemas/format-profile.js";
import {
  ALL_ADAPT_FORMAT_IDS,
  FORMAT_ADAPTATION_PROFILES,
  getFormatProfile,
} from "../formats/profiles.js";
import { SCHEMA_VERSION } from "../schemas/version.js";

export type FormatAdaptationInput = {
  brief: DesignBrief;
  brand: BrandProfile;
  concept: Concept;
  approvedCopy: ApprovedCopy;
  /** Formats to produce. Defaults to all five. */
  formats?: AdaptFormatId[];
  adaptationFamilyId?: string;
  now?: string;
  allowedClaimIds?: string[];
  allowedAssetIds?: string[];
};

export type FormatAdaptationResult = {
  familyId: string;
  governingIdea: string;
  brandId: string;
  specs: DesignSpec[];
  reports: FormatAdaptationReport[];
  /** True when any format needs copy re-approval before production. */
  blockedOnCopyApproval: boolean;
};

function charCount(text: string | undefined): number {
  return (text ?? "").trim().length;
}

function analyzeField(input: {
  field: ContentAdaptationItem["field"];
  fieldKey?: string;
  text: string | undefined;
  budget: { maxChars: number; required: boolean };
  roleLabel: string;
}): ContentAdaptationItem | null {
  const text = input.text?.trim() ?? "";
  if (!text) {
    if (input.budget.required) {
      const item: ContentAdaptationItem = {
        field: input.field,
        originalText: "(missing)",
        action: "rewrite",
        reason: `${input.roleLabel} is required for this format but missing from approved copy.`,
        requiresCopyApproval: true,
        maxChars: input.budget.maxChars,
      };
      if (input.fieldKey) item.fieldKey = input.fieldKey;
      return item;
    }
    return null;
  }

  if (input.budget.maxChars === 0) {
    const item: ContentAdaptationItem = {
      field: input.field,
      originalText: text,
      action: "remove",
      reason: `${input.roleLabel} does not fit this format’s composition — remove rather than shrink type.`,
      requiresCopyApproval: false,
      maxChars: 0,
    };
    if (input.fieldKey) item.fieldKey = input.fieldKey;
    return item;
  }

  if (text.length <= input.budget.maxChars) {
    const item: ContentAdaptationItem = {
      field: input.field,
      originalText: text,
      action: "keep",
      reason: `${input.roleLabel} fits the ${input.budget.maxChars}-character budget.`,
      requiresCopyApproval: false,
      maxChars: input.budget.maxChars,
    };
    if (input.fieldKey) item.fieldKey = input.fieldKey;
    return item;
  }

  const overflow = text.length - input.budget.maxChars;
  const item: ContentAdaptationItem = {
    field: input.field,
    originalText: text,
    action: overflow > input.budget.maxChars ? "rewrite" : "shorten",
    reason:
      `${input.roleLabel} is ${text.length} characters; budget is ${input.budget.maxChars}. ` +
      `Do not silently shrink type below the format minimum — shorten or rewrite and re-approve.`,
    requiresCopyApproval: true,
    maxChars: input.budget.maxChars,
    suggestedText: text.slice(0, Math.max(0, input.budget.maxChars - 1)).trimEnd() + "…",
  };
  if (input.fieldKey) item.fieldKey = input.fieldKey;
  return item;
}

/**
 * Build content adaptation items for a format.
 * Never recommends shrinking type below profile minimums.
 */
export function buildContentAdaptationItems(
  profile: FormatAdaptationProfile,
  copy: ApprovedCopy,
): ContentAdaptationItem[] {
  const items: ContentAdaptationItem[] = [];

  const headline = analyzeField({
    field: "headline",
    text: copy.headline,
    budget: profile.copyBudgets.headline,
    roleLabel: "Headline",
  });
  if (headline) items.push(headline);

  const subhead = analyzeField({
    field: "subhead",
    text: copy.subhead,
    budget: {
      ...profile.copyBudgets.subhead,
      required:
        profile.copyBudgets.subhead.required &&
        profile.secondaryMessageRole === "subhead",
    },
    roleLabel: "Subhead",
  });
  if (subhead) items.push(subhead);

  const body = analyzeField({
    field: "body",
    text: copy.body,
    budget: profile.copyBudgets.body,
    roleLabel: "Body",
  });
  if (body) items.push(body);

  const ctaRequired =
    profile.ctaPriority === "dominant" ||
    profile.ctaPriority === "strong" ||
    profile.ctaPriority === "balanced" ||
    profile.copyBudgets.callToAction.required;
  const cta = analyzeField({
    field: "callToAction",
    text: copy.callToAction,
    budget: {
      ...profile.copyBudgets.callToAction,
      required: ctaRequired && profile.ctaPriority !== "optional",
    },
    roleLabel: "CTA",
  });
  if (cta) items.push(cta);

  for (const [key, value] of Object.entries(copy.lockedLines)) {
    // Business card / email: keep short locked lines; flyer/poster tolerate more
    const max =
      profile.formatId === "business_card"
        ? 40
        : profile.formatId === "email_header"
          ? 36
          : 80;
    const locked = analyzeField({
      field: "lockedLine",
      fieldKey: key,
      text: value,
      budget: { maxChars: max, required: false },
      roleLabel: `Locked line (${key})`,
    });
    if (locked) items.push(locked);
  }

  // Contact claims: required fields must exist as approved contact claims when listed
  const contactClaims = copy.claims.filter((c) => c.kind === "contact");
  const requiredContacts = profile.requiredContactFields.filter((f) => f !== "none");
  if (requiredContacts.length > 0 && contactClaims.length === 0) {
    items.push({
      field: "contact",
      originalText: "(no approved contact claims)",
      action: "rewrite",
      reason: `Format requires contact fields (${requiredContacts.join(", ")}) but approved copy has no contact claims. Provide approved contact copy — do not invent details.`,
      requiresCopyApproval: true,
    });
  }

  for (const claim of copy.claims) {
    if (profile.formatId === "business_card" && claim.kind !== "contact") {
      // Long non-contact claims usually don't belong on a card
      if (claim.text.length > 36) {
        items.push({
          field: "claim",
          fieldKey: claim.id,
          originalText: claim.text,
          action: "remove",
          reason: "Non-contact claim is too long for business card; keep contacts only.",
          requiresCopyApproval: false,
          maxChars: 36,
        });
      }
    }
  }

  return items;
}

function wouldNeedUnreadableType(
  profile: FormatAdaptationProfile,
  items: ContentAdaptationItem[],
): boolean {
  // If copy overflows and we refuse silent shrink, we escalate — flag the risk.
  return items.some(
    (i) => i.action === "shorten" || i.action === "rewrite" || i.action === "remove",
  )
    ? items.some((i) => i.action === "shorten" || i.action === "rewrite")
    : false;
}

function buildProductionNotes(
  profile: FormatAdaptationProfile,
  concept: Concept,
  items: ContentAdaptationItem[],
): string[] {
  const notes = [
    `Format adaptation: ${profile.label} — ${profile.compositionThesis}`,
    `Viewing distance: ${profile.viewingDistance} (${profile.viewingDistanceNotes})`,
    `Primary message role: ${profile.primaryMessageRole}; secondary: ${profile.secondaryMessageRole}`,
    `CTA priority: ${profile.ctaPriority}`,
    `Minimum type: headline ${profile.minimumTypeSize.headlinePt}pt, body ${profile.minimumTypeSize.bodyPt}pt, CTA ${profile.minimumTypeSize.ctaPt}pt — never silently shrink below these`,
    `Safe area: ${profile.safeArea.top}/${profile.safeArea.right}/${profile.safeArea.bottom}/${profile.safeArea.left} ${profile.safeArea.unit}`,
    `Logo behavior: ${profile.logoBehavior}`,
    `Image crop: ${profile.imageCropBehavior}`,
    `QR placement: ${profile.qrCodePlacement}`,
    `Required contact: ${profile.requiredContactFields.join(", ")}`,
    `Export: ${profile.exportRequirements.formats.join(", ")} (${profile.exportRequirements.colorMode}` +
      `${profile.exportRequirements.dpi ? `, ${profile.exportRequirements.dpi} dpi` : ""})`,
    `Governing idea (preserved): ${concept.oneSentenceIdea || concept.governingIdea}`,
  ];

  const changes = items.filter((i) => i.action !== "keep");
  if (changes.length) {
    notes.push(
      `Content adaptation required: ${changes
        .map((c) => `${c.field}=${c.action}`)
        .join("; ")}`,
    );
  } else {
    notes.push("Approved copy fits this format’s budgets without changes.");
  }

  notes.push(...profile.exportRequirements.notes);
  return notes;
}

function buildHardConstraints(
  profile: FormatAdaptationProfile,
  brief: DesignBrief,
  copy: ApprovedCopy,
  items: ContentAdaptationItem[],
): DesignSpec["hardConstraints"] {
  const removed = new Set(
    items.filter((i) => i.action === "remove").map((i) => i.originalText),
  );

  const mustInclude = [
    ...brief.hardConstraints.mustIncludeText,
    copy.headline,
    copy.callToAction,
  ].filter((t) => !removed.has(t));

  // If headline must be shortened, don't force the full original into mustInclude
  const headlineItem = items.find((i) => i.field === "headline");
  const filteredInclude =
    headlineItem &&
    (headlineItem.action === "shorten" || headlineItem.action === "rewrite")
      ? mustInclude.filter((t) => t !== copy.headline)
      : mustInclude;

  const printerRequired =
    profile.exportRequirements.colorMode === "cmyk" ||
    profile.exportRequirements.includeBleed;

  return {
    mustIncludeText: [...new Set(filteredInclude)],
    mustExcludeText: [
      ...brief.hardConstraints.mustExcludeText,
      ...brief.prohibitedClaims,
    ],
    formatId: profile.formatId,
    dimensions: { ...profile.dimensions },
    localization: { ...brief.hardConstraints.localization },
    accessibility: {
      ...brief.hardConstraints.accessibility,
      minBodyFontPt: profile.minimumTypeSize.bodyPt,
      notes: [
        ...brief.hardConstraints.accessibility.notes,
        `Minimum headline ${profile.minimumTypeSize.headlinePt}pt; body ${profile.minimumTypeSize.bodyPt}pt; CTA ${profile.minimumTypeSize.ctaPt}pt`,
      ],
    },
    printer: {
      required: printerRequired,
      bleedInches: profile.exportRequirements.includeBleed
        ? profile.safeArea.unit === "in"
          ? Math.min(profile.safeArea.top, 0.125)
          : 0.125
        : undefined,
      safeMarginInches:
        profile.safeArea.unit === "in" ? profile.safeArea.top : undefined,
      colorMode:
        profile.exportRequirements.colorMode === "either"
          ? "rgb"
          : profile.exportRequirements.colorMode,
      notes: [
        `Safe area ${profile.safeArea.top}/${profile.safeArea.right}/${profile.safeArea.bottom}/${profile.safeArea.left} ${profile.safeArea.unit}`,
        ...(profile.safeArea.notes ? [profile.safeArea.notes] : []),
      ],
    },
    requireApprovalFor: [...brief.hardConstraints.requireApprovalFor],
  };
}

function summarizeReport(
  profile: FormatAdaptationProfile,
  items: ContentAdaptationItem[],
): string {
  const shorten = items.filter((i) => i.action === "shorten").length;
  const remove = items.filter((i) => i.action === "remove").length;
  const rewrite = items.filter((i) => i.action === "rewrite").length;
  const keep = items.filter((i) => i.action === "keep").length;
  return (
    `${profile.label}: keep ${keep}, shorten ${shorten}, remove ${remove}, rewrite ${rewrite}. ` +
    `Composition follows “${profile.compositionThesis}” — not a resize of another format.`
  );
}

/**
 * Create a separate DesignSpec + adaptation report for each format,
 * preserving governing idea and brand system. Never silently shrink type.
 */
export function adaptFormatsToDesignSpecs(
  input: FormatAdaptationInput,
): FormatAdaptationResult {
  const now = input.now ?? new Date().toISOString();
  const formats = input.formats ?? ALL_ADAPT_FORMAT_IDS;
  const familyId =
    input.adaptationFamilyId ?? `adapt-${input.brief.id}-${input.concept.id}`;
  const governingIdea =
    input.concept.oneSentenceIdea || input.concept.governingIdea;

  const specs: DesignSpec[] = [];
  const reports: FormatAdaptationReport[] = [];

  for (const formatId of formats) {
    const profile = getFormatProfile(formatId);
    const items = buildContentAdaptationItems(profile, input.approvedCopy);
    const blockedOnCopyApproval = items.some(
      (i) => i.action === "shorten" || i.action === "rewrite",
    );
    const unreadable = wouldNeedUnreadableType(profile, items);

    const specId = `${familyId}-${formatId}`;
    const reportId = `${specId}-report`;

    const hardConstraints = buildHardConstraints(
      profile,
      input.brief,
      input.approvedCopy,
      items,
    );

    const creativePreferences = {
      ...input.brief.creativePreferences,
      notes: [
        ...input.brief.creativePreferences.notes,
        profile.compositionThesis,
        `Logo: ${profile.logoBehavior}; crop: ${profile.imageCropBehavior}; QR: ${profile.qrCodePlacement}`,
      ],
      imageryHints: [
        ...input.brief.creativePreferences.imageryHints,
        `Crop behavior: ${profile.imageCropBehavior}`,
      ],
      typographyHints: [
        ...input.brief.creativePreferences.typographyHints,
        `Min type headline ${profile.minimumTypeSize.headlinePt}pt / body ${profile.minimumTypeSize.bodyPt}pt`,
      ],
    };

    // Brand system preserved via brandId + production notes referencing brand rules
    const brandNotes = [
      `Brand system: ${input.brand.brandName} (${input.brand.id})`,
      `Respect logo rules and brand colors; logo behavior for this format: ${profile.logoBehavior}`,
    ];

    const spec = DesignSpecSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: specId,
      createdAt: now,
      updatedAt: now,
      briefId: input.brief.id,
      brandId: input.brand.id,
      conceptId: input.concept.id,
      approvedCopyId: input.approvedCopy.id,
      formatId,
      governingIdea,
      governingIdeaKey: input.concept.governingIdeaKey,
      formatAdaptationReportId: reportId,
      adaptationFamilyId: familyId,
      hardConstraints,
      creativePreferences,
      productionNotes: [
        ...buildProductionNotes(profile, input.concept, items),
        ...brandNotes,
        ...input.brief.creativePreferences.doPrefer.map((d) => `Prefer: ${d}`),
      ],
      allowedClaimIds: input.allowedClaimIds ?? input.approvedCopy.claims.map((c) => c.id),
      allowedAssetIds:
        input.allowedAssetIds ??
        input.brand.assets.map((a) => a.assetId),
    });

    const report = FormatAdaptationReportSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: reportId,
      createdAt: now,
      updatedAt: now,
      formatId,
      sourceBriefId: input.brief.id,
      sourceConceptId: input.concept.id,
      governingIdea,
      designSpecId: specId,
      items,
      blockedOnCopyApproval,
      wouldRequireUnreadableType: unreadable,
      summary: summarizeReport(profile, items),
    });

    specs.push(spec);
    reports.push(report);
  }

  return {
    familyId,
    governingIdea,
    brandId: input.brand.id,
    specs,
    reports,
    blockedOnCopyApproval: reports.some((r) => r.blockedOnCopyApproval),
  };
}

export function listFormatProfiles(): FormatAdaptationProfile[] {
  return ALL_ADAPT_FORMAT_IDS.map((id) => FORMAT_ADAPTATION_PROFILES[id]);
}

export { getFormatProfile, ALL_ADAPT_FORMAT_IDS, FORMAT_ADAPTATION_PROFILES };

/** Estimate whether a string would force type below minimum if forced to fit. */
export function assertReadableTypeBudget(input: {
  text: string;
  maxChars: number;
  minimumPt: number;
  proposedPt: number;
}): void {
  if (input.proposedPt < input.minimumPt) {
    throw new Error(
      `Refusing to set type to ${input.proposedPt}pt below minimum ${input.minimumPt}pt. ` +
        `Shorten, remove, or rewrite copy (budget ${input.maxChars} chars; text is ${charCount(input.text)}). ` +
        `Never silently shrink type until unreadable.`,
    );
  }
}
