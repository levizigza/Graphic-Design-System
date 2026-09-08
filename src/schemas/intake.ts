import { z } from "zod";
import { ApprovedCopySchema } from "./approved-copy.js";
import {
  ChannelSchema,
  type Channel,
} from "./design-brief.js";
import {
  CreativePreferencesSchema,
  DocumentMetaSchema,
  HardConstraintsSchema,
  NonEmptyStringSchema,
  SupportedClaimSchema,
} from "./common.js";
import {
  BrandAssetEntrySchema,
  BrandColorTokenSchema,
  BrandFontTokenSchema,
  BrandVoiceSchema,
  ImageStyleSchema,
  LogoRulesSchema,
  AssetLicenseRecordSchema,
} from "./brand-profile.js";
import { DistinctivenessAuditSchema } from "./distinctiveness-audit.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Raw intake questionnaire — eight required collection areas.
 * Language: polished, confident, human, clear, sales-focused, no hype.
 * Never invent facts; leave fields empty rather than guess.
 */
export const IntakeOutputFormatSchema = z
  .object({
    formatId: NonEmptyStringSchema,
    channel: ChannelSchema,
    label: NonEmptyStringSchema,
    hardConstraints: HardConstraintsSchema,
  })
  .strict();

export type IntakeOutputFormat = z.infer<typeof IntakeOutputFormatSchema>;

export const DesignIntakeSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  organizationName: NonEmptyStringSchema,
  title: NonEmptyStringSchema,

  /** 1. What the organization offers. */
  offer: NonEmptyStringSchema.describe("Concrete offer — no invented features"),

  /** 2. Who needs it. */
  whoNeedsIt: z.object({
    primaryAudience: NonEmptyStringSchema,
    secondaryAudience: NonEmptyStringSchema.optional(),
    demographicsNotes: z.array(NonEmptyStringSchema).default([]),
    psychographicsNotes: z.array(NonEmptyStringSchema).default([]),
  }),

  /** 3. What situation triggers the purchase. */
  purchaseTrigger: z.object({
    situation: NonEmptyStringSchema,
    stage: z.enum([
      "unaware",
      "problem_aware",
      "solution_aware",
      "product_aware",
      "most_aware",
    ]),
    objections: z.array(NonEmptyStringSchema).default([]),
    competitors: z.array(NonEmptyStringSchema).default([]),
  }),

  /** 4. What the viewer should understand in two seconds. */
  twoSecondUnderstanding: NonEmptyStringSchema,

  /** 5. What the viewer should do next. */
  nextAction: NonEmptyStringSchema,

  /** 6. Exact approved copy and prohibited claims. */
  copyAndClaims: z.object({
    approvedCopy: ApprovedCopySchema,
    prohibitedClaims: z.array(NonEmptyStringSchema).default([]),
    supportedClaims: z.array(SupportedClaimSchema).default([]),
  }),

  /** 7. Required brand assets and permitted variation. */
  brandAssets: z.object({
    brandName: NonEmptyStringSchema,
    legalName: NonEmptyStringSchema.optional(),
    voice: BrandVoiceSchema.default({
      tone: ["polished", "confident", "human", "clear", "sales-focused"],
      doSay: [],
      dontSay: [
        "revolutionary",
        "world-class",
        "guaranteed results",
        "best ever",
        "#1",
        "miracle",
        "exclusive secret",
      ],
      banHype: true,
      neverInventFacts: true,
    }),
    colors: z.array(BrandColorTokenSchema).min(1),
    fonts: z.array(BrandFontTokenSchema).default([]),
    logoRules: LogoRulesSchema.default({
      allowedBackgrounds: [],
      forbiddenTreatments: [
        "stretch",
        "recolor_off_brand",
        "add_effects",
        "rotate_askew",
      ],
      mustRemainIntact: true,
    }),
    imageStyle: ImageStyleSchema.optional(),
    assets: z.array(BrandAssetEntrySchema).default([]),
    licenseRecords: z.array(AssetLicenseRecordSchema).default([]),
    logos: z
      .array(
        z
          .object({
            assetId: NonEmptyStringSchema,
            approvalRecordId: NonEmptyStringSchema,
            usage: z
              .enum(["primary", "lockup", "icon", "wordmark", "other"])
              .default("primary"),
          })
          .strict(),
      )
      .default([]),
    website: z.string().url().optional(),
    brandApprovalRecordId: NonEmptyStringSchema,
    distinctivenessAudit: DistinctivenessAuditSchema.optional(),
  }),

  /** 8. Output formats and production constraints. */
  outputs: z.array(IntakeOutputFormatSchema).min(1),

  creativePreferences: CreativePreferencesSchema.default({
    moodKeywords: [],
    preferredPaletteHints: [],
    typographyHints: [],
    imageryHints: [],
    doPrefer: [],
    doAvoid: [],
    referenceUrls: [],
    notes: [],
  }),

  briefApprovalRecordId: NonEmptyStringSchema,
  objective: NonEmptyStringSchema.optional(),
})
  .strict()
  .superRefine((intake, ctx) => {
    if (!intake.offer.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Offer is required — do not invent what the organization sells",
        path: ["offer"],
      });
    }
    if (!intake.twoSecondUnderstanding.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Two-second understanding is required",
        path: ["twoSecondUnderstanding"],
      });
    }
    if (!intake.nextAction.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Next action is required",
        path: ["nextAction"],
      });
    }
    if (intake.copyAndClaims.approvedCopy.approvalStatus !== "approved") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exact approved copy is required before production",
        path: ["copyAndClaims", "approvedCopy", "approvalStatus"],
      });
    }

    const formatIds = new Set<string>();
    for (const [i, out] of intake.outputs.entries()) {
      if (formatIds.has(out.formatId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate formatId ${out.formatId}`,
          path: ["outputs", i, "formatId"],
        });
      }
      formatIds.add(out.formatId);

      if (out.hardConstraints.formatId !== out.formatId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "hardConstraints.formatId must match outputs[].formatId",
          path: ["outputs", i, "hardConstraints", "formatId"],
        });
      }

      if (
        out.channel === "print_poster" &&
        out.formatId !== "poster"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'print_poster channel requires formatId "poster"',
          path: ["outputs", i, "formatId"],
        });
      }
      if (
        out.channel === "print_business_card" &&
        out.formatId !== "business_card"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'print_business_card channel requires formatId "business_card"',
          path: ["outputs", i, "formatId"],
        });
      }
    }

    if (intake.brandAssets.distinctivenessAudit) {
      if (intake.brandAssets.distinctivenessAudit.brandName !== intake.brandAssets.brandName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Distinctiveness audit brandName must match brand assets brandName",
          path: ["brandAssets", "distinctivenessAudit", "brandName"],
        });
      }
    }
  });

export type DesignIntake = z.infer<typeof DesignIntakeSchema>;

export type { Channel };
