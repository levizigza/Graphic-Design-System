import { z } from "zod";
import {
  CreativePreferencesSchema,
  DocumentMetaSchema,
  HardConstraintsSchema,
  NonEmptyStringSchema,
} from "./common.js";
import { AdaptFormatIdSchema } from "./format-profile.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Locked production spec for one format — merges brief hard constraints
 * with selected concept ids. Creative prefs remain advisory only.
 *
 * Format adaptations produce one DesignSpec per format. Do not resize
 * a single spec across formats.
 */
export const DesignSpecSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  briefId: NonEmptyStringSchema,
  brandId: NonEmptyStringSchema,
  conceptId: NonEmptyStringSchema,
  approvedCopyId: NonEmptyStringSchema,
  /** Target format — must match hardConstraints.formatId. */
  formatId: AdaptFormatIdSchema,
  /** Shared across a format family — preserved from the selected concept. */
  governingIdea: NonEmptyStringSchema,
  governingIdeaKey: NonEmptyStringSchema.optional(),
  /** Optional link to the adaptation report for this format. */
  formatAdaptationReportId: NonEmptyStringSchema.optional(),
  /** Sibling specs share this family id when adapted together. */
  adaptationFamilyId: NonEmptyStringSchema.optional(),
  hardConstraints: HardConstraintsSchema,
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
  /** Generation prompt material — must not introduce unapproved claims. */
  productionNotes: z.array(NonEmptyStringSchema).default([]),
  /** Explicit allow-list of claim ids permitted on this design. */
  allowedClaimIds: z.array(NonEmptyStringSchema).default([]),
  /** Asset ids (logos, photos) permitted — inventing assets is forbidden. */
  allowedAssetIds: z.array(NonEmptyStringSchema).default([]),
})
  .strict()
  .superRefine((spec, ctx) => {
    if (!spec.conceptId.trim() || !spec.approvedCopyId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DesignSpec requires conceptId and approvedCopyId",
      });
    }
    if (spec.hardConstraints.formatId !== spec.formatId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "hardConstraints.formatId must equal formatId",
        path: ["hardConstraints", "formatId"],
      });
    }
  });

export type DesignSpec = z.infer<typeof DesignSpecSchema>;
