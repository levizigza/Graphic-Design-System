import { z } from "zod";
import {
  CreativePreferencesSchema,
  DocumentMetaSchema,
  NonEmptyStringSchema,
  UrlSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

export const TypographyBehaviorSchema = z
  .object({
    /** How type carries the message (role), not a font menu. */
    behavior: NonEmptyStringSchema.describe(
      "e.g. bold display then quiet body; stacked urgency; conversational caption",
    ),
    displayRole: NonEmptyStringSchema,
    pairingNotes: NonEmptyStringSchema,
    caseTreatment: z
      .enum(["as_written", "title", "sentence", "upper", "lower"])
      .default("as_written"),
    weightContrast: z.enum(["low", "medium", "high"]).default("medium"),
    /**
     * Optional brand font roles to respect — never the sole differentiator
     * between concepts.
     */
    brandFontRolesUsed: z
      .array(z.enum(["display", "headline", "body", "mono", "other"]))
      .default([]),
  })
  .strict();

/** @deprecated Use TypographyBehaviorSchema — alias for older imports. */
export const TypographyDirectionSchema = TypographyBehaviorSchema;

export const MessageHierarchySchema = z
  .object({
    primary: NonEmptyStringSchema.describe("What the eye must hit first"),
    secondary: NonEmptyStringSchema,
    tertiary: NonEmptyStringSchema.optional(),
    exit: NonEmptyStringSchema.describe("CTA / contact as final read"),
  })
  .strict();

/** @deprecated Use MessageHierarchySchema */
export const HierarchySchema = MessageHierarchySchema;

/**
 * Primary stylistic axis — concepts must diversify across these.
 * Color or font-only swaps are not valid axes.
 */
export const StyleAxisSchema = z.enum([
  "narrative_scene",
  "typographic_system",
  "editorial_collage",
  "diagram_explainer",
  "object_symbol",
  "human_moment",
  "environment_atmosphere",
  "pattern_system",
  "contrast_disruption",
  "other",
]);

export type StyleAxis = z.infer<typeof StyleAxisSchema>;

export const ImageStrategySchema = z
  .object({
    approach: NonEmptyStringSchema.describe(
      "Photographic / illustrative / diagrammatic / typographic-led strategy",
    ),
    /** Stable key for metaphor clustering (e.g. "open_door", "toolkit_flatlay"). */
    metaphorKey: NonEmptyStringSchema,
    metaphorDescription: NonEmptyStringSchema,
    dependsOnReference: z.boolean().default(false),
    referenceNote: NonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((img, ctx) => {
    if (img.dependsOnReference && !img.referenceNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "referenceNote required when dependsOnReference is true",
        path: ["referenceNote"],
      });
    }
  });

export type ImageStrategy = z.infer<typeof ImageStrategySchema>;

/**
 * Text-only concept card for the concept board.
 * No image generation or Canva layout until two directions are selected.
 */
export const ConceptSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  status: z.enum(["draft", "proposed", "selected", "rejected"]),
  /** Concepts on a board are text-only until visual development. */
  medium: z.literal("text_only").default("text_only"),

  /** One-sentence idea (governing creative thesis). */
  oneSentenceIdea: NonEmptyStringSchema,
  /** Alias retained for earlier docs / DesignSpec linkage. */
  governingIdea: NonEmptyStringSchema,
  /**
   * Cluster label for diversity checks — e.g. "threshold", "proof", "invitation".
   * At least three distinct keys required across a six-concept board.
   */
  governingIdeaKey: NonEmptyStringSchema,

  audienceInsight: NonEmptyStringSchema,
  semanticConnection: NonEmptyStringSchema,
  /** @deprecated Prefer semanticConnection; kept in sync by board builder. */
  semanticLinkToSubject: NonEmptyStringSchema.optional(),
  intendedEmotion: NonEmptyStringSchema,
  messageHierarchy: MessageHierarchySchema,
  /** @deprecated Prefer messageHierarchy */
  hierarchy: MessageHierarchySchema.optional(),
  typographyBehavior: TypographyBehaviorSchema,
  /** @deprecated Prefer typographyBehavior */
  typographyDirection: TypographyBehaviorSchema.optional(),
  imageStrategy: ImageStrategySchema,
  /** @deprecated Prefer imageStrategy.approach */
  imageMechanism: NonEmptyStringSchema.optional(),
  likelyMisconception: NonEmptyStringSchema,
  productionRisks: z.array(NonEmptyStringSchema).min(1),
  /** @deprecated Prefer productionRisks */
  risks: z.array(NonEmptyStringSchema).optional(),
  distinctivenessHypothesis: NonEmptyStringSchema,

  styleAxis: StyleAxisSchema,
  references: z
    .array(
      z
        .object({
          label: NonEmptyStringSchema,
          url: UrlSchema.optional(),
          note: NonEmptyStringSchema.optional(),
        })
        .strict(),
    )
    .default([]),

  selectionReason: NonEmptyStringSchema.optional(),
  rejectionReason: NonEmptyStringSchema.optional(),
  creativePreferences: CreativePreferencesSchema.optional(),
  briefId: NonEmptyStringSchema,
  brandId: NonEmptyStringSchema,
})
  .strict()
  .superRefine((concept, ctx) => {
    if (concept.status === "rejected" && !concept.rejectionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rejectionReason is required when concept status is rejected",
        path: ["rejectionReason"],
      });
    }
    if (concept.status === "selected") {
      if (concept.rejectionReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "selected concepts must not carry rejectionReason",
          path: ["rejectionReason"],
        });
      }
      if (!concept.selectionReason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "selectionReason is required when concept status is selected",
          path: ["selectionReason"],
        });
      }
    }
    if (concept.medium !== "text_only") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Board concepts must remain text_only before visual development",
        path: ["medium"],
      });
    }
  });

export type Concept = z.infer<typeof ConceptSchema>;

/** Normalize deprecated field aliases onto the canonical shape. */
export function normalizeConceptFields<T extends Concept>(concept: T): T {
  const semantic =
    concept.semanticConnection || concept.semanticLinkToSubject || "";
  const hierarchy = concept.messageHierarchy ?? concept.hierarchy;
  const typography = concept.typographyBehavior ?? concept.typographyDirection;
  const risks = concept.productionRisks?.length
    ? concept.productionRisks
    : concept.risks ?? [];
  const idea = concept.oneSentenceIdea || concept.governingIdea;

  return {
    ...concept,
    oneSentenceIdea: idea,
    governingIdea: concept.governingIdea || idea,
    semanticConnection: semantic,
    semanticLinkToSubject: semantic,
    messageHierarchy: hierarchy!,
    hierarchy,
    typographyBehavior: typography!,
    typographyDirection: typography,
    imageMechanism: concept.imageStrategy?.approach ?? concept.imageMechanism,
    productionRisks: risks,
    risks,
  };
}
