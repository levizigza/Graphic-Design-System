import { z } from "zod";
import {
  DocumentMetaSchema,
  HexColorSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  UrlSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

export const BrandColorTokenSchema = z
  .object({
    role: z.enum([
      "primary",
      "secondary",
      "accent",
      "neutral",
      "background",
      "foreground",
      "other",
    ]),
    hex: HexColorSchema,
    name: NonEmptyStringSchema.optional(),
  })
  .strict();

export const BrandFontTokenSchema = z
  .object({
    role: z.enum(["display", "headline", "body", "mono", "other"]),
    family: NonEmptyStringSchema,
    fallbackStack: z.array(NonEmptyStringSchema).default([]),
    licensed: z.boolean().default(true),
    licenseRecordId: NonEmptyStringSchema.optional(),
  })
  .strict();

/** Provenance + license for any brand asset. Never invent ownership. */
export const AssetLicenseRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    assetId: NonEmptyStringSchema,
    owner: NonEmptyStringSchema,
    licenseType: z.enum([
      "owned",
      "exclusive_license",
      "nonexclusive_license",
      "stock_licensed",
      "client_supplied",
      "unknown",
    ]),
    licenseLabel: NonEmptyStringSchema,
    sourceRef: z.union([UrlSchema, NonEmptyStringSchema]).optional(),
    expiresAt: IsoDateTimeSchema.optional(),
    commercialUseAllowed: z.boolean(),
    modificationAllowed: z.boolean().default(true),
    attributionRequired: z.boolean().default(false),
    notes: z.array(NonEmptyStringSchema).default([]),
  })
  .strict()
  .superRefine((rec, ctx) => {
    if (rec.licenseType === "unknown") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "License type unknown is not production-ready — resolve provenance before use",
        path: ["licenseType"],
      });
    }
    if (!rec.commercialUseAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assets without commercial use rights cannot ship on marketing designs",
        path: ["commercialUseAllowed"],
      });
    }
  });

export type AssetLicenseRecord = z.infer<typeof AssetLicenseRecordSchema>;

export const LogoRulesSchema = z
  .object({
    primaryAssetId: NonEmptyStringSchema.optional(),
    minClearSpace: z
      .object({
        value: z.number().nonnegative(),
        unit: z.enum(["px", "in", "mm", "x_height"]),
      })
      .optional(),
    minReproductionSize: z
      .object({
        value: z.number().positive(),
        unit: z.enum(["px", "in", "mm"]),
      })
      .optional(),
    allowedBackgrounds: z.array(NonEmptyStringSchema).default([]),
    forbiddenTreatments: z
      .array(NonEmptyStringSchema)
      .default(["stretch", "recolor_off_brand", "add_effects", "rotate_askew"]),
    mustRemainIntact: z.boolean().default(true),
  })
  .strict();

export type LogoRules = z.infer<typeof LogoRulesSchema>;

export const ImageStyleSchema = z
  .object({
    description: NonEmptyStringSchema,
    lighting: NonEmptyStringSchema.optional(),
    subjectMatter: z.array(NonEmptyStringSchema).default([]),
    doPrefer: z.array(NonEmptyStringSchema).default([]),
    doAvoid: z.array(NonEmptyStringSchema).default([]),
  })
  .strict();

export type ImageStyle = z.infer<typeof ImageStyleSchema>;

/**
 * Classification of a brand asset for production rules.
 * - fixed: must appear as-is when required
 * - distinctive: proposed brand-signature asset (see distinctiveness audit)
 * - variable: may change within stated bounds
 * - approval_required: cannot use without ApprovalRecord
 */
export const BrandAssetClassSchema = z.enum([
  "fixed",
  "distinctive",
  "variable",
  "approval_required",
]);

export type BrandAssetClass = z.infer<typeof BrandAssetClassSchema>;

export const BrandAssetEntrySchema = z
  .object({
    assetId: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    kind: z.enum([
      "logo",
      "wordmark",
      "icon",
      "pattern",
      "photo",
      "illustration",
      "certification_mark",
      "other",
    ]),
    classes: z.array(BrandAssetClassSchema).min(1),
    /** Bounds for variable assets — empty when not variable. */
    permittedVariation: z.array(NonEmptyStringSchema).default([]),
    licenseRecordId: NonEmptyStringSchema,
    approvalRecordId: NonEmptyStringSchema.optional(),
    url: UrlSchema.optional(),
    localPath: NonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((asset, ctx) => {
    const needsApproval =
      asset.classes.includes("approval_required") ||
      asset.kind === "logo" ||
      asset.kind === "wordmark" ||
      asset.kind === "certification_mark";

    if (needsApproval && !asset.approvalRecordId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.kind} / approval_required asset needs approvalRecordId — do not invent logos or marks`,
        path: ["approvalRecordId"],
      });
    }

    if (asset.classes.includes("variable") && asset.permittedVariation.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Variable assets must declare permittedVariation bounds",
        path: ["permittedVariation"],
      });
    }

    if (asset.classes.includes("fixed") && asset.permittedVariation.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fixed assets cannot declare permittedVariation",
        path: ["permittedVariation"],
      });
    }
  });

export type BrandAssetEntry = z.infer<typeof BrandAssetEntrySchema>;

/**
 * Voice for Graphic Design System copy and operator-facing text:
 * polished, confident, human, clear, sales-focused — without hype.
 * Never invent facts.
 */
export const BrandVoiceSchema = z
  .object({
    tone: z
      .array(NonEmptyStringSchema)
      .min(1)
      .default(["polished", "confident", "human", "clear", "sales-focused"]),
    doSay: z.array(NonEmptyStringSchema).default([]),
    dontSay: z
      .array(NonEmptyStringSchema)
      .default([
        "revolutionary",
        "world-class",
        "guaranteed results",
        "best ever",
        "#1",
        "miracle",
        "exclusive secret",
      ]),
    banHype: z.boolean().default(true),
    neverInventFacts: z.literal(true).default(true),
  })
  .strict();

export type BrandVoice = z.infer<typeof BrandVoiceSchema>;

export const BrandLogoRefSchema = z
  .object({
    assetId: NonEmptyStringSchema,
    approvalRecordId: NonEmptyStringSchema,
    usage: z.enum(["primary", "lockup", "icon", "wordmark", "other"]).default("primary"),
    url: UrlSchema.optional(),
  })
  .strict();

export const BrandProfileSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  brandName: NonEmptyStringSchema,
  legalName: NonEmptyStringSchema.optional(),
  voice: BrandVoiceSchema,
  colors: z.array(BrandColorTokenSchema).min(1),
  fonts: z.array(BrandFontTokenSchema).default([]),
  logoRules: LogoRulesSchema.default({
    allowedBackgrounds: [],
    forbiddenTreatments: ["stretch", "recolor_off_brand", "add_effects", "rotate_askew"],
    mustRemainIntact: true,
  }),
  imageStyle: ImageStyleSchema.optional(),
  /** Full asset register with fixed / distinctive / variable / approval classes. */
  assets: z.array(BrandAssetEntrySchema).default([]),
  /** Convenience logo refs (must also appear in assets when used). */
  logos: z.array(BrandLogoRefSchema).default([]),
  certifications: z
    .array(
      z
        .object({
          name: NonEmptyStringSchema,
          assetId: NonEmptyStringSchema.optional(),
          approvalRecordId: NonEmptyStringSchema,
          claimId: NonEmptyStringSchema.optional(),
        })
        .strict(),
    )
    .default([]),
  licenseRecords: z.array(AssetLicenseRecordSchema).default([]),
  /** DistinctivenessAudit.id linking research hypotheses for distinctive assets. */
  distinctivenessAuditId: NonEmptyStringSchema.optional(),
  website: UrlSchema.optional(),
  brandApprovalRecordId: NonEmptyStringSchema,
  hardConstraints: z
    .object({
      mustUsePrimaryLogo: z.boolean().default(false),
      mustUseBrandColors: z.boolean().default(true),
      forbiddenImagery: z.array(NonEmptyStringSchema).default([]),
    })
    .default({
      mustUsePrimaryLogo: false,
      mustUseBrandColors: true,
      forbiddenImagery: [],
    }),
  creativePreferences: z
    .object({
      moodKeywords: z.array(NonEmptyStringSchema).default([]),
      layoutNotes: z.array(NonEmptyStringSchema).default([]),
    })
    .default({ moodKeywords: [], layoutNotes: [] }),
})
  .strict()
  .superRefine((brand, ctx) => {
    if (!brand.brandApprovalRecordId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing brand approval",
        path: ["brandApprovalRecordId"],
      });
    }

    const licenseIds = new Set(brand.licenseRecords.map((r) => r.id));
    const licenseAssetIds = new Set(brand.licenseRecords.map((r) => r.assetId));

    for (const [i, asset] of brand.assets.entries()) {
      if (!licenseIds.has(asset.licenseRecordId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Asset ${asset.assetId} references missing licenseRecordId ${asset.licenseRecordId}`,
          path: ["assets", i, "licenseRecordId"],
        });
      }
    }

    for (const [i, logo] of brand.logos.entries()) {
      if (!logo.approvalRecordId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Logo without approval is rejected — do not fabricate logos",
          path: ["logos", i, "approvalRecordId"],
        });
      }
    }

    for (const [i, cert] of brand.certifications.entries()) {
      if (!cert.approvalRecordId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Certification without approval is rejected",
          path: ["certifications", i, "approvalRecordId"],
        });
      }
    }

    for (const [i, lic] of brand.licenseRecords.entries()) {
      const known = brand.assets.some((a) => a.assetId === lic.assetId);
      if (!known && !licenseAssetIds.has(lic.assetId)) {
        // license may precede asset registration; warn via path only if orphaned from logos too
        const inLogos = brand.logos.some((l) => l.assetId === lic.assetId);
        if (!inLogos) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `License record ${lic.id} has no matching asset ${lic.assetId} in assets or logos`,
            path: ["licenseRecords", i, "assetId"],
          });
        }
      }
    }

    if (brand.logoRules.primaryAssetId) {
      const found =
        brand.assets.some((a) => a.assetId === brand.logoRules.primaryAssetId) ||
        brand.logos.some((l) => l.assetId === brand.logoRules.primaryAssetId);
      if (!found) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "logoRules.primaryAssetId must exist in assets or logos",
          path: ["logoRules", "primaryAssetId"],
        });
      }
    }
  });

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export function fixedAssets(brand: BrandProfile): BrandAssetEntry[] {
  return brand.assets.filter((a) => a.classes.includes("fixed"));
}

export function distinctiveAssets(brand: BrandProfile): BrandAssetEntry[] {
  return brand.assets.filter((a) => a.classes.includes("distinctive"));
}

export function variableAssets(brand: BrandProfile): BrandAssetEntry[] {
  return brand.assets.filter((a) => a.classes.includes("variable"));
}

export function approvalRequiredAssets(brand: BrandProfile): BrandAssetEntry[] {
  return brand.assets.filter((a) => a.classes.includes("approval_required"));
}
