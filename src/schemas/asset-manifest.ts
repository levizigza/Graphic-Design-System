import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  UrlSchema,
} from "./common.js";
import { AssetLicenseRecordSchema } from "./brand-profile.js";
import { SCHEMA_VERSION } from "./version.js";

export const AssetKindSchema = z.enum([
  "logo",
  "photo",
  "illustration",
  "icon",
  "certification_mark",
  "font_file",
  "other",
]);

export const AssetProvenanceSchema = z
  .object({
    origin: z.enum([
      "client_supplied",
      "brand_kit",
      "stock",
      "generated",
      "canva_library",
      "other",
    ]),
    acquiredAt: IsoDateTimeSchema.optional(),
    supplier: NonEmptyStringSchema.optional(),
    sourceRef: z.union([UrlSchema, NonEmptyStringSchema]).optional(),
    notes: z.array(NonEmptyStringSchema).default([]),
  })
  .strict();

export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;

/**
 * Single asset entry. Logos and certification marks require approval.
 * Fabricated logos/certs without approvalRecordId are rejected.
 * Production assets require licenseRecordId + provenance.
 */
export const AssetEntrySchema = z
  .object({
    id: NonEmptyStringSchema,
    kind: AssetKindSchema,
    label: NonEmptyStringSchema,
    sourceUrl: UrlSchema.optional(),
    localPath: NonEmptyStringSchema.optional(),
    canvaAssetId: NonEmptyStringSchema.optional(),
    sha256: Sha256Schema.optional(),
    mimeType: NonEmptyStringSchema.optional(),
    approvalRecordId: NonEmptyStringSchema.optional(),
    licenseRecordId: NonEmptyStringSchema.optional(),
    provenance: AssetProvenanceSchema.optional(),
    uploadedAt: IsoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((asset, ctx) => {
    if (
      (asset.kind === "logo" || asset.kind === "certification_mark") &&
      !asset.approvalRecordId?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${asset.kind} requires approvalRecordId — fabricated logos/certifications are rejected`,
        path: ["approvalRecordId"],
      });
    }
    if (!asset.sourceUrl && !asset.localPath && !asset.canvaAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Asset must have sourceUrl, localPath, or canvaAssetId",
        path: ["sourceUrl"],
      });
    }
  });

export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const AssetManifestSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  jobId: NonEmptyStringSchema,
  correlationId: NonEmptyStringSchema.optional(),
  designVersion: NonEmptyStringSchema.optional(),
  assets: z.array(AssetEntrySchema),
  /** Full license records for assets used on this job (provenance manifest). */
  licenses: z.array(AssetLicenseRecordSchema).default([]),
})
  .strict()
  .superRefine((manifest, ctx) => {
    const ids = new Set<string>();
    for (const [i, asset] of manifest.assets.entries()) {
      if (ids.has(asset.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate asset id ${asset.id}`,
          path: ["assets", i, "id"],
        });
      }
      ids.add(asset.id);
    }

    const licenseIds = new Set(manifest.licenses.map((l) => l.id));
    for (const [i, asset] of manifest.assets.entries()) {
      if (asset.licenseRecordId && !licenseIds.has(asset.licenseRecordId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Asset ${asset.id} references missing license ${asset.licenseRecordId}`,
          path: ["assets", i, "licenseRecordId"],
        });
      }
      if (!asset.licenseRecordId || !asset.provenance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Production asset manifests require licenseRecordId and provenance on every asset",
          path: ["assets", i, asset.licenseRecordId ? "provenance" : "licenseRecordId"],
        });
      }
    }
  });

export type AssetManifest = z.infer<typeof AssetManifestSchema>;
