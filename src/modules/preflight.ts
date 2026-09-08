import { exactCopyStrings, type ApprovedCopy } from "../schemas/approved-copy.js";
import type { BrandProfile } from "../schemas/brand-profile.js";
import type { DesignSpec } from "../schemas/design-spec.js";
import type {
  PreflightCheck,
  PreflightReport,
  PreflightSeverity,
} from "../schemas/preflight-report.js";
import { PreflightReportSchema } from "../schemas/preflight-report.js";
import { findUnsupportedFactualStrings } from "../schemas/integrity.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import {
  contrastRatio,
  DEFAULT_PRINT_CONTRAST,
  isLargeText,
  resolveDigitalContrastStandard,
  type ContrastLevel,
  type ContrastRequirement,
} from "../lib/contrast.js";
import type { FormatAdaptationProfile } from "../schemas/format-profile.js";
import { getFormatProfile } from "../formats/profiles.js";
import type { AdaptFormatId } from "../schemas/format-profile.js";

export type TextBoxObservation = {
  elementId?: string;
  pageIndex?: number;
  role?: "headline" | "body" | "cta" | "contact" | "other";
  text: string;
  fontSizePt: number;
  bold?: boolean;
  /** Bounding box vs container — overflow if content exceeds. */
  boxWidth: number;
  boxHeight: number;
  contentWidth: number;
  contentHeight: number;
  clipped?: boolean;
  foregroundHex?: string;
  backgroundHex?: string;
};

export type LogoObservation = {
  elementId?: string;
  clearSpaceActual: number;
  clearSpaceRequired: number;
  unit: "px" | "in" | "mm" | "x_height";
};

export type ImageObservation = {
  elementId?: string;
  widthPx: number;
  heightPx: number;
  /** Effective PPI at placed size when known. */
  effectivePpi?: number;
  assetId?: string;
};

export type QrObservation = {
  elementId?: string;
  present: boolean;
  quietZoneOk?: boolean;
  /** Printed/module size in mm at final output. */
  moduleSizeMm?: number;
  /** Minimum module size for reliable scan at intended distance. */
  minModuleSizeMm?: number;
  placementOk?: boolean;
};

export type PrintVerification = {
  bleedVerified: boolean;
  cropMarksVerified: boolean;
  colorProfileVerified: boolean;
  proofingVerified: boolean;
};

export type PreflightObservations = {
  observedText: string[];
  textBoxes?: TextBoxObservation[];
  logo?: LogoObservation;
  images?: ImageObservation[];
  qr?: QrObservation;
  /** Measured page size (should match spec). */
  pageWidth?: number;
  pageHeight?: number;
  pageUnit?: "px" | "in" | "mm" | "cm";
  /** Spelling suspects from an external spellchecker (optional). */
  spellingSuspects?: Array<{ word: string; location?: string }>;
  /** Assets used on the design (ids). */
  usedAssetIds?: string[];
  exportFormat?: string;
  printVerification?: PrintVerification;
};

export type PreflightEngineInput = {
  designSpec: DesignSpec;
  approvedCopy: ApprovedCopy;
  brand: BrandProfile;
  /** From Canva handoff — required before approval. */
  designId: string | null;
  editUrl: string | null;
  renderResultId: string;
  observations: PreflightObservations;
  prohibitedClaims?: string[];
  outputKind?: "digital" | "print" | "hybrid";
  /** Digital default WCAG 2.2 AA; set AAA or custom print thresholds as needed. */
  digitalContrastLevel?: ContrastLevel;
  printContrast?: ContrastRequirement;
  /** Stricter digital ratio override (e.g. 7 for normal text). */
  stricterDigitalNormalTextRatio?: number;
  formatProfile?: FormatAdaptationProfile;
  now?: string;
  id?: string;
};

function check(
  partial: {
    id: string;
    category: PreflightCheck["category"];
    status: PreflightCheck["status"];
    severity: PreflightSeverity;
    message: string;
    hard: boolean;
    evidence: string;
    suggestedCorrection: string;
    location?: PreflightCheck["location"];
  },
): PreflightCheck {
  const location: PreflightCheck["location"] = {};
  if (partial.location?.pageIndex != null) location.pageIndex = partial.location.pageIndex;
  if (partial.location?.elementId) location.elementId = partial.location.elementId;
  if (partial.location?.region) location.region = partial.location.region;
  if (partial.location?.field) location.field = partial.location.field;
  return {
    id: partial.id,
    category: partial.category,
    status: partial.status,
    severity: partial.severity,
    message: partial.message,
    hard: partial.hard,
    location,
    evidence: partial.evidence,
    suggestedCorrection: partial.suggestedCorrection,
  };
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesExact(haystacks: string[], needle: string): boolean {
  const n = normalize(needle);
  return haystacks.some((h) => normalize(h).includes(n) || normalize(h) === n);
}

/**
 * Run structured preflight before approval.
 * Does not invent observations — missing evidence becomes a fail/warn with correction to measure.
 */
export function runPreflight(input: PreflightEngineInput): PreflightReport {
  const now = input.now ?? new Date().toISOString();
  const outputKind = input.outputKind ?? inferOutputKind(input.designSpec);
  const formatProfile =
    input.formatProfile ??
    (isAdaptFormat(input.designSpec.formatId)
      ? getFormatProfile(input.designSpec.formatId)
      : undefined);

  const contrastStandard =
    outputKind === "print"
      ? ("custom_print" as const)
      : input.digitalContrastLevel === "AAA"
        ? ("wcag_2_2_aaa" as const)
        : ("wcag_2_2_aa" as const);

  const contrastReq: ContrastRequirement =
    outputKind === "print"
      ? (input.printContrast ?? DEFAULT_PRINT_CONTRAST)
      : (() => {
          const base = resolveDigitalContrastStandard(
            input.digitalContrastLevel ?? "AA",
          );
          if (input.stricterDigitalNormalTextRatio) {
            return {
              ...base,
              normalText: Math.max(
                base.normalText,
                input.stricterDigitalNormalTextRatio,
              ),
            };
          }
          return base;
        })();

  const checks: PreflightCheck[] = [];
  const observed = input.observations.observedText;

  // --- Exact approved copy ---
  const requiredCopy = [
    input.approvedCopy.headline,
    input.approvedCopy.callToAction,
    ...exactCopyStrings(input.approvedCopy).filter(
      (t) =>
        t === input.approvedCopy.headline ||
        t === input.approvedCopy.callToAction ||
        input.designSpec.hardConstraints.mustIncludeText.includes(t),
    ),
  ];
  const uniqueRequired = [...new Set(requiredCopy)];
  for (const text of uniqueRequired) {
    if (!includesExact(observed, text)) {
      // If adaptation removed body, don't require removed strings
      const removedViaMustExclude =
        input.designSpec.hardConstraints.mustExcludeText.some((x) =>
          normalize(x).includes(normalize(text)),
        );
      if (removedViaMustExclude) continue;
      checks.push(
        check({
          id: `copy-missing-${hashId(text)}`,
          category: "copy",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Exact approved copy not found on design",
          location: { field: "approvedCopy" },
          evidence: `Required string not observed: "${text}"`,
          suggestedCorrection:
            "Place the exact approved string on-design via editing transaction; do not paraphrase.",
        }),
      );
    } else {
      checks.push(
        check({
          id: `copy-present-${hashId(text)}`,
          category: "copy",
          status: "pass",
          severity: "info",
          hard: true,
          message: "Approved copy present",
          evidence: `Observed includes "${text}"`,
          suggestedCorrection: "None",
        }),
      );
    }
  }

  // --- Forbidden claims ---
  const prohibited = [
    ...(input.prohibitedClaims ?? []),
    ...input.designSpec.hardConstraints.mustExcludeText,
  ];
  for (const ban of prohibited) {
    if (includesExact(observed, ban)) {
      checks.push(
        check({
          id: `claims-forbidden-${hashId(ban)}`,
          category: "claims",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Forbidden claim language appears on design",
          location: { field: "prohibitedClaims" },
          evidence: `Observed text contains prohibited phrase: "${ban}"`,
          suggestedCorrection: "Remove the phrase; use only approved claims.",
        }),
      );
    }
  }

  const allowedClaimTexts = input.approvedCopy.claims.map((c) => c.text);
  const suspects = findUnsupportedFactualStrings(observed, [
    ...allowedClaimTexts,
    ...exactCopyStrings(input.approvedCopy),
  ]);
  for (const s of suspects) {
    checks.push(
      check({
        id: `claims-unsupported-${hashId(s)}`,
        category: "claims",
        status: "fail",
        severity: "major",
        hard: true,
        message: "Unsupported factual string detected",
        evidence: `Observed "${s}" is not in approved claims/copy`,
        suggestedCorrection:
          "Remove or replace with an approved claim; never invent prices, dates, contacts, or credentials.",
      }),
    );
  }

  // --- Spelling ---
  for (const suspect of input.observations.spellingSuspects ?? []) {
    checks.push(
      check({
        id: `spelling-${hashId(suspect.word)}`,
        category: "spelling",
        status: "fail",
        severity: "major",
        hard: true,
        message: "Possible spelling issue",
        location: { field: suspect.location },
        evidence: `Suspect token "${suspect.word}"`,
        suggestedCorrection:
          "Confirm against approved copy; correct only if the approved source is wrong and re-approve.",
      }),
    );
  }
  if (!input.observations.spellingSuspects) {
    checks.push(
      check({
        id: "spelling-not-run",
        category: "spelling",
        status: "warn",
        severity: "minor",
        hard: false,
        message: "Spelling pass not provided",
        evidence: "observations.spellingSuspects omitted",
        suggestedCorrection:
          "Run a spellcheck against observed text and pass suspects into preflight.",
      }),
    );
  }

  // --- Overflow / clipping / type size / hierarchy / CTA / contrast ---
  const boxes = input.observations.textBoxes ?? [];
  if (boxes.length === 0) {
    checks.push(
      check({
        id: "overflow-unmeasured",
        category: "overflow",
        status: "warn",
        severity: "major",
        hard: false,
        message: "Text overflow not measured",
        evidence: "No textBoxes observations supplied",
        suggestedCorrection:
          "Measure text boxes (content vs frame) before approval.",
      }),
    );
    checks.push(
      check({
        id: "type-size-unmeasured",
        category: "type_size",
        status: "warn",
        severity: "major",
        hard: false,
        message: "Type sizes not measured",
        evidence: "No textBoxes observations supplied",
        suggestedCorrection: `Measure font sizes; minimums must meet format/spec (body ≥ ${input.designSpec.hardConstraints.accessibility.minBodyFontPt ?? formatProfile?.minimumTypeSize.bodyPt ?? "spec"}pt).`,
      }),
    );
  }

  const minHeadline =
    formatProfile?.minimumTypeSize.headlinePt ??
    input.designSpec.hardConstraints.accessibility.minBodyFontPt ??
    12;
  const minBody =
    input.designSpec.hardConstraints.accessibility.minBodyFontPt ??
    formatProfile?.minimumTypeSize.bodyPt ??
    10;
  const minCta = formatProfile?.minimumTypeSize.ctaPt ?? minBody;

  let sawHeadline = false;
  let sawCta = false;

  for (const box of boxes) {
    const loc: PreflightCheck["location"] = {};
    if (box.elementId) loc.elementId = box.elementId;
    if (box.pageIndex != null) loc.pageIndex = box.pageIndex;
    if (box.role) loc.field = box.role;

    if (box.clipped || box.contentWidth > box.boxWidth + 0.5 || box.contentHeight > box.boxHeight + 0.5) {
      checks.push(
        check({
          id: `overflow-${box.elementId ?? hashId(box.text)}`,
          category: "overflow",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Text overflow or clipping detected",
          location: loc,
          evidence: `content ${box.contentWidth}×${box.contentHeight} vs box ${box.boxWidth}×${box.boxHeight}; clipped=${Boolean(box.clipped)}`,
          suggestedCorrection:
            "Widen/taller frame, shorten approved copy (with re-approval), or reflow — do not shrink type below minimum.",
        }),
      );
    }

    const minForRole =
      box.role === "headline"
        ? minHeadline
        : box.role === "cta"
          ? minCta
          : minBody;

    if (box.fontSizePt + 1e-6 < minForRole) {
      checks.push(
        check({
          id: `type-size-${box.elementId ?? hashId(box.text)}`,
          category: "type_size",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Type below minimum readable size",
          location: loc,
          evidence: `${box.fontSizePt}pt < minimum ${minForRole}pt for role ${box.role ?? "other"}`,
          suggestedCorrection:
            "Increase type to the format minimum or shorten/rewrite copy with approval — never silently shrink until unreadable.",
        }),
      );
    }

    if (box.role === "headline") sawHeadline = true;
    if (box.role === "cta") sawCta = true;

    if (box.foregroundHex && box.backgroundHex) {
      const ratio = contrastRatio(box.foregroundHex, box.backgroundHex);
      const largeArgs: { fontSizePt: number; bold?: boolean } = {
        fontSizePt: box.fontSizePt,
      };
      if (box.bold != null) largeArgs.bold = box.bold;
      const kind = isLargeText(largeArgs) ? "largeText" : "normalText";
      const needed = contrastReq[kind];
      if (ratio + 1e-6 < needed) {
        checks.push(
          check({
            id: `contrast-${box.elementId ?? hashId(box.text)}`,
            category: "contrast",
            status: "fail",
            severity: "blocker",
            hard: true,
            message: `Contrast below ${outputKind === "print" ? "configured print" : "WCAG 2.2"} threshold`,
            location: loc,
            evidence: `ratio ${ratio.toFixed(2)}:1 < required ${needed}:1 (${kind}; fg ${box.foregroundHex} on ${box.backgroundHex})`,
            suggestedCorrection:
              "Darken/lighten text or background until the threshold is met; re-check large vs normal text rules.",
          }),
        );
      } else {
        checks.push(
          check({
            id: `contrast-ok-${box.elementId ?? hashId(box.text)}`,
            category: "contrast",
            status: "pass",
            severity: "info",
            hard: true,
            message: "Contrast meets threshold",
            location: loc,
            evidence: `${ratio.toFixed(2)}:1 ≥ ${needed}:1`,
            suggestedCorrection: "None",
          }),
        );
      }
    }
  }

  if (boxes.length > 0 && !sawHeadline) {
    checks.push(
      check({
        id: "hierarchy-headline-missing",
        category: "hierarchy",
        status: "fail",
        severity: "major",
        hard: true,
        message: "No headline-role text box observed",
        evidence: "textBoxes lack role=headline",
        suggestedCorrection: "Mark the primary message element as headline and ensure it is the dominant read.",
      }),
    );
  }

  const ctaPriority = formatProfile?.ctaPriority;
  if (boxes.length > 0 && ctaPriority && ctaPriority !== "optional" && !sawCta) {
    checks.push(
      check({
        id: "cta-missing",
        category: "cta",
        status: "fail",
        severity: ctaPriority === "dominant" || ctaPriority === "strong" ? "blocker" : "major",
        hard: true,
        message: "CTA not visible in observations",
        evidence: `Format CTA priority is ${ctaPriority}; no role=cta text box found`,
        suggestedCorrection: "Add/emphasize the approved CTA so it is clearly visible.",
      }),
    );
  } else if (sawCta) {
    checks.push(
      check({
        id: "cta-present",
        category: "cta",
        status: "pass",
        severity: "info",
        hard: true,
        message: "CTA observed",
        evidence: "At least one text box with role=cta",
        suggestedCorrection: "None",
      }),
    );
  }

  // --- Logo clear space ---
  if (input.observations.logo) {
    const logo = input.observations.logo;
    if (logo.clearSpaceActual + 1e-6 < logo.clearSpaceRequired) {
      checks.push(
        check({
          id: "logo-clear-space",
          category: "logo",
          status: "fail",
          severity: "major",
          hard: true,
          message: "Logo clear space violated",
          location: { elementId: logo.elementId, region: "logo" },
          evidence: `clear space ${logo.clearSpaceActual}${logo.unit} < required ${logo.clearSpaceRequired}${logo.unit}`,
          suggestedCorrection:
            "Increase padding around the logo to brand clear-space rules; do not distort the mark.",
        }),
      );
    } else {
      checks.push(
        check({
          id: "logo-clear-space-ok",
          category: "logo",
          status: "pass",
          severity: "info",
          hard: true,
          message: "Logo clear space OK",
          evidence: `${logo.clearSpaceActual}${logo.unit} ≥ ${logo.clearSpaceRequired}${logo.unit}`,
          suggestedCorrection: "None",
        }),
      );
    }
  } else if (input.brand.hardConstraints.mustUsePrimaryLogo) {
    checks.push(
      check({
        id: "logo-unmeasured",
        category: "logo",
        status: "fail",
        severity: "major",
        hard: true,
        message: "Primary logo required but clear space not measured",
        evidence: "observations.logo omitted while mustUsePrimaryLogo=true",
        suggestedCorrection: "Measure logo clear space against brand logoRules.",
      }),
    );
  }

  // --- Safe area & bleed ---
  const printer = input.designSpec.hardConstraints.printer;
  if (printer.required) {
    if (printer.safeMarginInches == null) {
      checks.push(
        check({
          id: "safe-area-unspecified",
          category: "safe_area",
          status: "fail",
          severity: "major",
          hard: true,
          message: "Print safe margin not specified on spec",
          evidence: "hardConstraints.printer.safeMarginInches missing",
          suggestedCorrection: "Set safe margins from the format profile before approval.",
        }),
      );
    } else {
      checks.push(
        check({
          id: "safe-area-specified",
          category: "safe_area",
          status: "pass",
          severity: "info",
          hard: true,
          message: "Safe margin specified on spec",
          evidence: `safeMarginInches=${printer.safeMarginInches}`,
          suggestedCorrection: "Verify live layout respects this margin.",
        }),
      );
    }
    if (printer.bleedInches == null || printer.bleedInches <= 0) {
      checks.push(
        check({
          id: "bleed-missing",
          category: "bleed",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Bleed not specified for print output",
          evidence: "printer.required=true but bleedInches missing/zero",
          suggestedCorrection: "Add required bleed (e.g. 0.125 in) and keep critical type inside safe area.",
        }),
      );
    }
  } else if (formatProfile?.safeArea) {
    checks.push(
      check({
        id: "safe-area-digital",
        category: "safe_area",
        status: "pass",
        severity: "info",
        hard: false,
        message: "Digital safe area defined by format profile",
        evidence: `${formatProfile.safeArea.top}/${formatProfile.safeArea.right}/${formatProfile.safeArea.bottom}/${formatProfile.safeArea.left} ${formatProfile.safeArea.unit}`,
        suggestedCorrection: "Confirm layout insets match the format safe area.",
      }),
    );
  }

  // --- Image resolution ---
  const minPpi = outputKind === "print" || outputKind === "hybrid" ? 300 : 72;
  for (const img of input.observations.images ?? []) {
    if (img.effectivePpi != null && img.effectivePpi + 1e-6 < minPpi) {
      checks.push(
        check({
          id: `image-ppi-${img.elementId ?? img.assetId ?? hashId(String(img.widthPx))}`,
          category: "image_resolution",
          status: "fail",
          severity: "major",
          hard: true,
          message: "Image resolution below target",
          location: { elementId: img.elementId },
          evidence: `effective PPI ${img.effectivePpi} < ${minPpi} for ${outputKind}`,
          suggestedCorrection: "Replace with a higher-resolution licensed asset or reduce placed size.",
        }),
      );
    }
  }
  if ((input.observations.images?.length ?? 0) === 0) {
    checks.push(
      check({
        id: "image-resolution-unmeasured",
        category: "image_resolution",
        status: "warn",
        severity: "minor",
        hard: false,
        message: "No image resolution observations",
        evidence: "observations.images empty/omitted",
        suggestedCorrection: "Record placed image PPI before print approval.",
      }),
    );
  }

  // --- Aspect ratio / page dimensions ---
  const dim = input.designSpec.hardConstraints.dimensions;
  if (
    input.observations.pageWidth != null &&
    input.observations.pageHeight != null &&
    input.observations.pageUnit
  ) {
    const unitOk = input.observations.pageUnit === dim.unit;
    const wOk = nearlyEqual(input.observations.pageWidth, dim.width, 0.02);
    const hOk = nearlyEqual(input.observations.pageHeight, dim.height, 0.02);
    if (!unitOk || !wOk || !hOk) {
      checks.push(
        check({
          id: "dimensions-mismatch",
          category: "dimensions",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Page dimensions do not match DesignSpec",
          evidence: `observed ${input.observations.pageWidth}×${input.observations.pageHeight} ${input.observations.pageUnit} vs spec ${dim.width}×${dim.height} ${dim.unit}`,
          suggestedCorrection:
            "Recreate or resize using the format’s DesignSpec — do not assume a naive resize from another format.",
        }),
      );
    } else {
      checks.push(
        check({
          id: "dimensions-ok",
          category: "dimensions",
          status: "pass",
          severity: "info",
          hard: true,
          message: "Page dimensions match spec",
          evidence: `${dim.width}×${dim.height} ${dim.unit}`,
          suggestedCorrection: "None",
        }),
      );
    }
  } else {
    checks.push(
      check({
        id: "dimensions-unmeasured",
        category: "dimensions",
        status: "fail",
        severity: "major",
        hard: true,
        message: "Page dimensions not measured",
        evidence: "observations.pageWidth/Height/Unit missing",
        suggestedCorrection: "Read page size from Canva get-design-pages / transaction pages and compare to spec.",
      }),
    );
  }

  // --- QR ---
  const qrRule = formatProfile?.qrCodePlacement;
  const qr = input.observations.qr;
  if (qrRule && qrRule !== "omit" && qrRule !== "back_side_only" && qrRule.startsWith("required")) {
    if (!qr?.present) {
      checks.push(
        check({
          id: "qr-missing",
          category: "qr",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Required QR code missing",
          evidence: `Format requires ${qrRule}`,
          suggestedCorrection: "Place an approved QR with adequate quiet zone and scannable module size.",
        }),
      );
    }
  }
  if (qr?.present) {
    if (qr.quietZoneOk === false) {
      checks.push(
        check({
          id: "qr-quiet-zone",
          category: "qr",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "QR quiet zone insufficient",
          location: { elementId: qr.elementId },
          evidence: "quietZoneOk=false",
          suggestedCorrection: "Add clear margin around the QR (typically ≥4 modules).",
        }),
      );
    }
    const minMod = qr.minModuleSizeMm ?? 0.5;
    if (qr.moduleSizeMm != null && qr.moduleSizeMm + 1e-6 < minMod) {
      checks.push(
        check({
          id: "qr-scan-size",
          category: "qr",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "QR module size too small for reliable real-size scan",
          location: { elementId: qr.elementId },
          evidence: `module ${qr.moduleSizeMm}mm < minimum ${minMod}mm`,
          suggestedCorrection: "Enlarge QR at final print/digital size and re-test scan.",
        }),
      );
    } else if (qr.moduleSizeMm == null) {
      checks.push(
        check({
          id: "qr-size-unmeasured",
          category: "qr",
          status: "warn",
          severity: "major",
          hard: false,
          message: "QR real-size scan not verified",
          evidence: "moduleSizeMm not provided",
          suggestedCorrection: "Measure printed/on-screen module size and perform a live scan test.",
        }),
      );
    }
  }

  // --- Asset licenses ---
  const used = input.observations.usedAssetIds ?? input.designSpec.allowedAssetIds;
  for (const assetId of used) {
    const license = input.brand.licenseRecords.find((l) => l.assetId === assetId);
    const asset = input.brand.assets.find((a) => a.assetId === assetId);
    if (!license) {
      checks.push(
        check({
          id: `license-missing-${assetId}`,
          category: "license",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Asset missing license/provenance record",
          location: { field: assetId },
          evidence: `No licenseRecords entry for assetId=${assetId}`,
          suggestedCorrection: "Attach a commercial-use license record before approval.",
        }),
      );
      continue;
    }
    if (!license.commercialUseAllowed || license.licenseType === "unknown") {
      checks.push(
        check({
          id: `license-invalid-${assetId}`,
          category: "license",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Asset license not valid for marketing use",
          location: { field: assetId },
          evidence: `licenseType=${license.licenseType}; commercialUseAllowed=${license.commercialUseAllowed}`,
          suggestedCorrection: "Replace the asset or obtain a clear commercial license.",
        }),
      );
    }
    if (
      asset &&
      (asset.classes.includes("approval_required") || asset.kind === "logo") &&
      !asset.approvalRecordId
    ) {
      checks.push(
        check({
          id: `license-approval-${assetId}`,
          category: "license",
          status: "fail",
          severity: "blocker",
          hard: true,
          message: "Logo/approval-required asset lacks approvalRecordId",
          evidence: `asset ${assetId} missing approval`,
          suggestedCorrection: "Obtain brand approval before shipping.",
        }),
      );
    }
  }

  // --- Export + printer requirements ---
  const exportFormats =
    formatProfile?.exportRequirements.formats.map(String) ??
    (printer.required ? ["pdf"] : ["png"]);
  if (input.observations.exportFormat) {
    if (!exportFormats.includes(input.observations.exportFormat)) {
      checks.push(
        check({
          id: "export-format",
          category: "export",
          status: "fail",
          severity: "major",
          hard: true,
          message: "Export format not allowed for this DesignSpec/format",
          evidence: `exportFormat=${input.observations.exportFormat}; allowed=${exportFormats.join(",")}`,
          suggestedCorrection: `Export as one of: ${exportFormats.join(", ")}.`,
        }),
      );
    } else {
      checks.push(
        check({
          id: "export-format-ok",
          category: "export",
          status: "pass",
          severity: "info",
          hard: true,
          message: "Export format matches requirements",
          evidence: String(input.observations.exportFormat),
          suggestedCorrection: "None",
        }),
      );
    }
  } else {
    checks.push(
      check({
        id: "export-format-pending",
        category: "export",
        status: "warn",
        severity: "minor",
        hard: false,
        message: "Export format not yet chosen",
        evidence: "observations.exportFormat omitted",
        suggestedCorrection: `Plan export as ${exportFormats.join(" or ")} after handoff.`,
      }),
    );
  }

  if (printer.required && printer.colorMode) {
    checks.push(
      check({
        id: "printer-color-mode",
        category: "printer",
        status: "pass",
        severity: "info",
        hard: true,
        message: "Printer color mode specified on spec",
        evidence: `colorMode=${printer.colorMode}`,
        suggestedCorrection: "Verify export color profile matches before calling print-ready.",
      }),
    );
  }

  // --- Handoff: design ID + edit URL ---
  if (!input.designId?.trim()) {
    checks.push(
      check({
        id: "handoff-design-id",
        category: "handoff",
        status: "fail",
        severity: "blocker",
        hard: true,
        message: "Design ID missing",
        evidence: "designId is null/empty",
        suggestedCorrection: "Complete Canva create-design-from-candidate and record the live design ID.",
      }),
    );
  } else {
    checks.push(
      check({
        id: "handoff-design-id-ok",
        category: "handoff",
        status: "pass",
        severity: "info",
        hard: true,
        message: "Design ID present",
        evidence: input.designId,
        suggestedCorrection: "None",
      }),
    );
  }

  if (!input.editUrl?.trim()) {
    checks.push(
      check({
        id: "handoff-edit-url",
        category: "handoff",
        status: "fail",
        severity: "blocker",
        hard: true,
        message: "Edit URL missing",
        evidence: "editUrl is null/empty",
        suggestedCorrection: "Return the Canva edit URL from create/edit handoff before approval.",
      }),
    );
  } else {
    checks.push(
      check({
        id: "handoff-edit-url-ok",
        category: "handoff",
        status: "pass",
        severity: "info",
        hard: true,
        message: "Edit URL present",
        evidence: input.editUrl,
        suggestedCorrection: "None",
      }),
    );
  }

  // --- Print-ready gate ---
  const pv = input.observations.printVerification;
  const printReadyBlockers: string[] = [];
  if (outputKind === "print" || outputKind === "hybrid" || printer.required) {
    const flags: Array<keyof PrintVerification> = [
      "bleedVerified",
      "cropMarksVerified",
      "colorProfileVerified",
      "proofingVerified",
    ];
    const keyMap: Record<keyof PrintVerification, string> = {
      bleedVerified: "bleed_verified",
      cropMarksVerified: "crop_marks_verified",
      colorProfileVerified: "color_profile_verified",
      proofingVerified: "proofing_verified",
    };
    for (const flag of flags) {
      if (!pv?.[flag]) {
        printReadyBlockers.push(keyMap[flag]);
        checks.push(
          check({
            id: `print-${keyMap[flag]}`,
            category: "printer",
            status: "fail",
            severity: "blocker",
            hard: true,
            message: `Print verification missing: ${keyMap[flag]}`,
            evidence: pv
              ? `${flag}=false`
              : "observations.printVerification omitted",
            suggestedCorrection:
              "Do not label an API PDF print-ready until bleed, crop marks, color profile, and proofing are verified.",
          }),
        );
      } else {
        printReadyBlockers.push(`cleared:${keyMap[flag]}`);
      }
    }
  }

  const printReady =
    printReadyBlockers.length > 0 &&
    printReadyBlockers.every((b) => b.startsWith("cleared:")) &&
    (outputKind === "print" || outputKind === "hybrid" || printer.required);

  // Ensure at least one check
  if (checks.length === 0) {
    checks.push(
      check({
        id: "preflight-empty",
        category: "other",
        status: "fail",
        severity: "blocker",
        hard: true,
        message: "No preflight checks produced",
        evidence: "empty checks array",
        suggestedCorrection: "Provide observations and re-run preflight.",
      }),
    );
  }

  const hardFails = checks.filter((c) => c.hard && c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");
  const outcome =
    hardFails.length > 0
      ? ("fail" as const)
      : warns.length > 0
        ? ("pass_with_warnings" as const)
        : ("pass" as const);

  const severityRank: Record<PreflightSeverity, number> = {
    blocker: 0,
    major: 1,
    minor: 2,
    info: 3,
  };
  const worst = [...hardFails].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  )[0];

  const summary =
    outcome === "pass"
      ? "Preflight passed — approval allowed."
      : outcome === "pass_with_warnings"
        ? `Preflight passed with ${warns.length} warning(s) — approval allowed; review warnings.`
        : `Preflight failed (${hardFails.length} hard fail(s)${worst ? `; worst=${worst.severity}: ${worst.message}` : ""}). Approval blocked.`;

  return PreflightReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: input.id ?? `preflight-${input.designSpec.id}-${now}`,
    createdAt: now,
    updatedAt: now,
    renderResultId: input.renderResultId,
    designSpecId: input.designSpec.id,
    designId: input.designId,
    editUrl: input.editUrl,
    outputKind,
    contrastStandard,
    checks,
    hardFailCount: hardFails.length,
    warnCount: warns.length,
    outcome,
    printReady: Boolean(printReady),
    printReadyBlockers,
    approvalAllowed: outcome !== "fail",
    observedText: observed,
    summary,
  });
}

function inferOutputKind(spec: DesignSpec): "digital" | "print" | "hybrid" {
  if (spec.hardConstraints.printer.required) return "print";
  if (
    spec.formatId === "social_post" ||
    spec.formatId === "email_header"
  ) {
    return "digital";
  }
  return "hybrid";
}

function isAdaptFormat(id: string): id is AdaptFormatId {
  return [
    "poster",
    "business_card",
    "social_post",
    "email_header",
    "one_page_flyer",
  ].includes(id);
}

function nearlyEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function hashId(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
