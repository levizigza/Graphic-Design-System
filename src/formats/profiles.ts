import type { AdaptFormatId, FormatAdaptationProfile } from "../schemas/format-profile.js";
import { FormatAdaptationProfileSchema } from "../schemas/format-profile.js";

/**
 * Canonical format profiles for Graphic Design System.
 * Each format is a distinct composition brief — not a resize of another.
 */
const RAW_PROFILES: FormatAdaptationProfile[] = [
  {
    formatId: "poster",
    label: "Poster",
    channel: "print_poster",
    viewingDistance: "wall_far",
    viewingDistanceNotes: "Read from several feet away on a wall or window.",
    primaryMessageRole: "headline",
    secondaryMessageRole: "datetime_place",
    ctaPriority: "strong",
    minimumTypeSize: {
      headlinePt: 72,
      bodyPt: 18,
      ctaPt: 24,
      contactPt: 14,
      unit: "pt",
    },
    safeArea: {
      top: 0.5,
      right: 0.5,
      bottom: 0.5,
      left: 0.5,
      unit: "in",
      notes: "Keep critical type inside safe area; bleed for imagery only.",
    },
    logoBehavior: "corner_anchor",
    imageCropBehavior: "full_bleed_subject_center",
    qrCodePlacement: "optional_footer",
    requiredContactFields: ["url"],
    exportRequirements: {
      formats: ["pdf", "png"],
      colorMode: "cmyk",
      dpi: 300,
      transparentBackground: false,
      includeBleed: true,
      notes: ["Export with crop marks when going to print shop."],
    },
    dimensions: { width: 18, height: 24, unit: "in" },
    copyBudgets: {
      headline: { maxChars: 42, maxLines: 2, required: true },
      subhead: { maxChars: 72, maxLines: 2, required: false },
      body: { maxChars: 160, maxLines: 4, required: false },
      callToAction: { maxChars: 28, maxLines: 1, required: true },
    },
    compositionThesis:
      "Large-scale hierarchy: one dominant headline, sparse secondary line, CTA as a clear closer — not a shrunk business card.",
  },
  {
    formatId: "business_card",
    label: "Business card",
    channel: "print_business_card",
    viewingDistance: "arm_length",
    viewingDistanceNotes: "Held in hand; scanned in seconds at arm’s length.",
    primaryMessageRole: "name_title",
    secondaryMessageRole: "contact",
    ctaPriority: "subtle",
    minimumTypeSize: {
      headlinePt: 10,
      bodyPt: 7.5,
      ctaPt: 7.5,
      contactPt: 7.5,
      unit: "pt",
    },
    safeArea: {
      top: 0.125,
      right: 0.125,
      bottom: 0.125,
      left: 0.125,
      unit: "in",
      notes: "Stay inside safe margin; avoid hairline type.",
    },
    logoBehavior: "corner_anchor",
    imageCropBehavior: "none_typography_led",
    qrCodePlacement: "back_side_only",
    requiredContactFields: ["name", "phone", "email", "url"],
    exportRequirements: {
      formats: ["pdf"],
      colorMode: "cmyk",
      dpi: 300,
      transparentBackground: false,
      includeBleed: true,
      notes: ["Front-focused for M1; QR only if back is in scope."],
    },
    dimensions: { width: 3.5, height: 2, unit: "in" },
    copyBudgets: {
      headline: { maxChars: 28, maxLines: 1, required: true },
      subhead: { maxChars: 36, maxLines: 1, required: false },
      body: { maxChars: 0, maxLines: 0, required: false },
      callToAction: { maxChars: 22, maxLines: 1, required: false },
    },
    compositionThesis:
      "Identity + contact density. Drop long body copy; keep name/offer crisp — never a miniaturized poster.",
  },
  {
    formatId: "social_post",
    label: "Social post",
    channel: "social_feed",
    viewingDistance: "screen_feed",
    viewingDistanceNotes: "Thumb-stopped in a mobile feed at close screen distance.",
    primaryMessageRole: "event_hook",
    secondaryMessageRole: "subhead",
    ctaPriority: "dominant",
    minimumTypeSize: {
      headlinePt: 28,
      bodyPt: 14,
      ctaPt: 16,
      contactPt: 12,
      unit: "pt",
    },
    safeArea: {
      top: 64,
      right: 48,
      bottom: 96,
      left: 48,
      unit: "px",
      notes: "Keep CTA above platform UI chrome; avoid edge-hugging type.",
    },
    logoBehavior: "header_band",
    imageCropBehavior: "full_bleed_subject_upper_third",
    qrCodePlacement: "omit",
    requiredContactFields: ["handle", "url"],
    exportRequirements: {
      formats: ["png", "jpg"],
      colorMode: "rgb",
      dpi: 72,
      transparentBackground: false,
      includeBleed: false,
      notes: ["sRGB; no print bleed."],
    },
    dimensions: { width: 1080, height: 1350, unit: "px" },
    copyBudgets: {
      headline: { maxChars: 48, maxLines: 3, required: true },
      subhead: { maxChars: 64, maxLines: 2, required: false },
      body: { maxChars: 90, maxLines: 3, required: false },
      callToAction: { maxChars: 24, maxLines: 1, required: true },
    },
    compositionThesis:
      "Feed-native hook + punchy CTA. Crop for faces/subject in the upper third — not a letterboxed poster photo.",
  },
  {
    formatId: "email_header",
    label: "Email header",
    channel: "email_header",
    viewingDistance: "screen_email",
    viewingDistanceNotes: "Inbox preview and header band on desktop/mobile email clients.",
    primaryMessageRole: "offer",
    secondaryMessageRole: "none",
    ctaPriority: "balanced",
    minimumTypeSize: {
      headlinePt: 22,
      bodyPt: 12,
      ctaPt: 14,
      contactPt: 11,
      unit: "pt",
    },
    safeArea: {
      top: 24,
      right: 32,
      bottom: 24,
      left: 32,
      unit: "px",
      notes: "Design for ~600px content width; keep type away from rounded client crops.",
    },
    logoBehavior: "header_band",
    imageCropBehavior: "letterbox_safe",
    qrCodePlacement: "omit",
    requiredContactFields: ["none"],
    exportRequirements: {
      formats: ["png", "jpg"],
      colorMode: "rgb",
      dpi: 72,
      transparentBackground: false,
      includeBleed: false,
      notes: ["Flat raster; avoid tiny text that email clients blur."],
    },
    dimensions: { width: 600, height: 200, unit: "px" },
    copyBudgets: {
      headline: { maxChars: 40, maxLines: 2, required: true },
      subhead: { maxChars: 48, maxLines: 1, required: false },
      body: { maxChars: 0, maxLines: 0, required: false },
      callToAction: { maxChars: 22, maxLines: 1, required: true },
    },
    compositionThesis:
      "Wide banner: headline + CTA only. Strip body paragraphs — do not squash a flyer into 200px height.",
  },
  {
    formatId: "one_page_flyer",
    label: "One-page flyer",
    channel: "print_flyer",
    viewingDistance: "wall_near",
    viewingDistanceNotes: "Handed out or posted at near reading distance (counter, corkboard).",
    primaryMessageRole: "headline",
    secondaryMessageRole: "detail",
    ctaPriority: "strong",
    minimumTypeSize: {
      headlinePt: 28,
      bodyPt: 10,
      ctaPt: 12,
      contactPt: 9,
      unit: "pt",
    },
    safeArea: {
      top: 0.375,
      right: 0.375,
      bottom: 0.375,
      left: 0.375,
      unit: "in",
      notes: "Letter trim; keep contact block inside safe area.",
    },
    logoBehavior: "corner_anchor",
    imageCropBehavior: "inset_frame",
    qrCodePlacement: "required_lower_right",
    requiredContactFields: ["phone", "email", "url", "address"],
    exportRequirements: {
      formats: ["pdf", "png"],
      colorMode: "cmyk",
      dpi: 300,
      transparentBackground: false,
      includeBleed: true,
      notes: ["Single-sided letter; QR must scan at print size."],
    },
    dimensions: { width: 8.5, height: 11, unit: "in" },
    copyBudgets: {
      headline: { maxChars: 48, maxLines: 2, required: true },
      subhead: { maxChars: 80, maxLines: 2, required: false },
      body: { maxChars: 320, maxLines: 8, required: false },
      callToAction: { maxChars: 28, maxLines: 1, required: true },
    },
    compositionThesis:
      "Readable handout with room for detail and a scannable QR — structured sections, not a scaled-up social post.",
  },
];

export const FORMAT_ADAPTATION_PROFILES: Record<
  AdaptFormatId,
  FormatAdaptationProfile
> = Object.fromEntries(
  RAW_PROFILES.map((p) => [p.formatId, FormatAdaptationProfileSchema.parse(p)]),
) as Record<AdaptFormatId, FormatAdaptationProfile>;

export const ALL_ADAPT_FORMAT_IDS = Object.keys(
  FORMAT_ADAPTATION_PROFILES,
) as AdaptFormatId[];

export function getFormatProfile(formatId: AdaptFormatId): FormatAdaptationProfile {
  return FORMAT_ADAPTATION_PROFILES[formatId];
}
