import { z } from "zod";
import {
  DocumentMetaSchema,
  NonEmptyStringSchema,
} from "./common.js";
import type { Channel } from "./design-brief.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Production formats that get their own DesignSpec.
 * Adaptation is per-format composition — not a single resize.
 */
export const AdaptFormatIdSchema = z.enum([
  "poster",
  "business_card",
  "social_post",
  "email_header",
  "one_page_flyer",
]);

export type AdaptFormatId = z.infer<typeof AdaptFormatIdSchema>;

export const ViewingDistanceSchema = z.enum([
  "arm_length",
  "desk",
  "wall_near",
  "wall_far",
  "screen_feed",
  "screen_email",
]);

export type ViewingDistance = z.infer<typeof ViewingDistanceSchema>;

export const CtaPrioritySchema = z.enum([
  "dominant",
  "strong",
  "balanced",
  "subtle",
  "optional",
]);

export type CtaPriority = z.infer<typeof CtaPrioritySchema>;

export const LogoBehaviorSchema = z.enum([
  "hero_lockup",
  "corner_anchor",
  "header_band",
  "footer_mark",
  "watermark_only",
  "omit_if_wordmark_in_type",
]);

export type LogoBehavior = z.infer<typeof LogoBehaviorSchema>;

export const ImageCropBehaviorSchema = z.enum([
  "full_bleed_subject_center",
  "full_bleed_subject_upper_third",
  "inset_frame",
  "letterbox_safe",
  "object_focus_tight",
  "none_typography_led",
]);

export type ImageCropBehavior = z.infer<typeof ImageCropBehaviorSchema>;

export const QrPlacementSchema = z.enum([
  "required_lower_right",
  "required_lower_left",
  "optional_footer",
  "omit",
  "back_side_only",
]);

export type QrPlacement = z.infer<typeof QrPlacementSchema>;

export const LengthBudgetSchema = z
  .object({
    /** Soft budget — overage triggers shorten/rewrite report, not silent shrink. */
    maxChars: z.number().int().nonnegative(),
    maxLines: z.number().int().nonnegative().optional(),
    required: z.boolean().default(true),
  })
  .strict();

/**
 * Format adaptation profile — hard production rules for one format.
 * Never treat these as “resize the poster.”
 */
export const FormatAdaptationProfileSchema = z
  .object({
    formatId: AdaptFormatIdSchema,
    label: NonEmptyStringSchema,
    channel: z.enum([
      "print_poster",
      "print_business_card",
      "social_feed",
      "email_header",
      "print_flyer",
      "other",
    ]),
    viewingDistance: ViewingDistanceSchema,
    viewingDistanceNotes: NonEmptyStringSchema,
    /** What this format must communicate first. */
    primaryMessageRole: z.enum([
      "headline",
      "offer",
      "name_title",
      "event_hook",
      "brand_mark",
    ]),
    /** Secondary read after primary. */
    secondaryMessageRole: z.enum([
      "subhead",
      "proof",
      "detail",
      "contact",
      "datetime_place",
      "none",
    ]),
    ctaPriority: CtaPrioritySchema,
    /** Minimum readable type — never silently shrink below these. */
    minimumTypeSize: z.object({
      headlinePt: z.number().positive(),
      bodyPt: z.number().positive(),
      ctaPt: z.number().positive(),
      contactPt: z.number().positive().optional(),
      unit: z.literal("pt").default("pt"),
    }),
    safeArea: z.object({
      top: z.number().nonnegative(),
      right: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
      left: z.number().nonnegative(),
      unit: z.enum(["in", "px", "mm"]),
      notes: NonEmptyStringSchema.optional(),
    }),
    logoBehavior: LogoBehaviorSchema,
    imageCropBehavior: ImageCropBehaviorSchema,
    qrCodePlacement: QrPlacementSchema,
    requiredContactFields: z.array(
      z.enum([
        "name",
        "title",
        "phone",
        "email",
        "url",
        "address",
        "handle",
        "none",
      ]),
    ),
    exportRequirements: z.object({
      formats: z.array(z.enum(["png", "pdf", "jpg", "gif"])).min(1),
      colorMode: z.enum(["rgb", "cmyk", "either"]),
      dpi: z.number().positive().optional(),
      transparentBackground: z.boolean().default(false),
      includeBleed: z.boolean().default(false),
      notes: z.array(NonEmptyStringSchema).default([]),
    }),
    dimensions: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      unit: z.enum(["px", "in", "mm", "cm"]),
    }),
    copyBudgets: z.object({
      headline: LengthBudgetSchema,
      subhead: LengthBudgetSchema,
      body: LengthBudgetSchema,
      callToAction: LengthBudgetSchema,
    }),
    /** Composition thesis — how this format differs from a naive resize. */
    compositionThesis: NonEmptyStringSchema,
  })
  .strict();

export type FormatAdaptationProfile = z.infer<typeof FormatAdaptationProfileSchema>;

export const ContentAdaptationActionSchema = z.enum([
  "keep",
  "shorten",
  "remove",
  "rewrite",
]);

export type ContentAdaptationAction = z.infer<typeof ContentAdaptationActionSchema>;

export const ContentAdaptationItemSchema = z
  .object({
    field: z.enum([
      "headline",
      "subhead",
      "body",
      "callToAction",
      "lockedLine",
      "claim",
      "contact",
    ]),
    fieldKey: NonEmptyStringSchema.optional(),
    originalText: NonEmptyStringSchema,
    action: ContentAdaptationActionSchema,
    reason: NonEmptyStringSchema,
    /** Suggested rewrite — only when action is rewrite/shorten; still needs approval. */
    suggestedText: NonEmptyStringSchema.optional(),
    maxChars: z.number().int().nonnegative().optional(),
    requiresCopyApproval: z.boolean().default(false),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      (item.action === "shorten" || item.action === "rewrite") &&
      item.requiresCopyApproval !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "shorten/rewrite adaptations require copy re-approval before production",
        path: ["requiresCopyApproval"],
      });
    }
    if (item.action === "keep" && item.suggestedText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "keep actions must not invent suggestedText",
        path: ["suggestedText"],
      });
    }
  });

export type ContentAdaptationItem = z.infer<typeof ContentAdaptationItemSchema>;

/**
 * Report of what must change for a format.
 * Silent type-shrinking below minimumTypeSize is forbidden.
 */
export const FormatAdaptationReportSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  formatId: AdaptFormatIdSchema,
  sourceBriefId: NonEmptyStringSchema,
  sourceConceptId: NonEmptyStringSchema,
  governingIdea: NonEmptyStringSchema,
  designSpecId: NonEmptyStringSchema,
  items: z.array(ContentAdaptationItemSchema),
  /** True when production must wait for shortened/rewritten copy approval. */
  blockedOnCopyApproval: z.boolean(),
  /**
   * True when fitting would require type below minimumTypeSize —
   * never auto-shrink; escalate to shorten/remove/rewrite instead.
   */
  wouldRequireUnreadableType: z.boolean(),
  summary: NonEmptyStringSchema,
})
  .strict()
  .superRefine((report, ctx) => {
    if (report.wouldRequireUnreadableType) {
      const hasEscalation = report.items.some(
        (i) => i.action === "shorten" || i.action === "remove" || i.action === "rewrite",
      );
      if (!hasEscalation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "wouldRequireUnreadableType must be paired with shorten/remove/rewrite items — never silently shrink type",
          path: ["items"],
        });
      }
    }
    const needsApproval = report.items.some(
      (i) => i.action === "shorten" || i.action === "rewrite",
    );
    if (needsApproval && !report.blockedOnCopyApproval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "blockedOnCopyApproval must be true when shorten/rewrite items exist",
        path: ["blockedOnCopyApproval"],
      });
    }
  });

export type FormatAdaptationReport = z.infer<typeof FormatAdaptationReportSchema>;

export function channelForFormat(formatId: AdaptFormatId): Channel {
  switch (formatId) {
    case "poster":
      return "print_poster";
    case "business_card":
      return "print_business_card";
    case "social_post":
      return "social_feed";
    case "email_header":
      return "email_header";
    case "one_page_flyer":
      return "print_flyer";
  }
}
