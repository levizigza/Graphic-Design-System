import { z } from "zod";
import { ApprovedCopySchema } from "./approved-copy.js";
import {
  CreativePreferencesSchema,
  DocumentMetaSchema,
  HardConstraintsSchema,
  NonEmptyStringSchema,
  SupportedClaimSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

export const ChannelSchema = z.enum([
  "print_poster",
  "print_business_card",
  "social_feed",
  "social_story",
  "email_header",
  "web_hero",
  "print_flyer",
  "other",
]);

export type Channel = z.infer<typeof ChannelSchema>;

/**
 * Design brief — hard constraints and creative preferences are separate.
 * Exact approved copy is mandatory. Claims without approvals fail.
 */
export const DesignBriefSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: NonEmptyStringSchema,
  /** What the organization offers — from intake; never invented. */
  offer: NonEmptyStringSchema,
  audience: z.object({
    primary: NonEmptyStringSchema,
    secondary: NonEmptyStringSchema.optional(),
    demographicsNotes: z.array(NonEmptyStringSchema).default([]),
    psychographicsNotes: z.array(NonEmptyStringSchema).default([]),
  }),
  buyingContext: z.object({
    stage: z.enum([
      "unaware",
      "problem_aware",
      "solution_aware",
      "product_aware",
      "most_aware",
    ]),
    setting: NonEmptyStringSchema.describe("Where/when the audience encounters this"),
    objections: z.array(NonEmptyStringSchema).default([]),
    competitors: z.array(NonEmptyStringSchema).default([]),
  }),
  objective: NonEmptyStringSchema,
  /** What the viewer should understand in two seconds. */
  oneMessageStatement: NonEmptyStringSchema,
  /** What the viewer should do next. */
  desiredAction: NonEmptyStringSchema,
  /** Exact strings that must never appear (prohibited claims). */
  prohibitedClaims: z.array(NonEmptyStringSchema).default([]),
  channel: ChannelSchema,
  /** Hard vs soft — do not merge. */
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
  /** Exact approved copy block (includes approvalStatus: approved). */
  approvedCopy: ApprovedCopySchema,
  /**
   * Job-level claims registry (prices, dates, testimonials, logos,
   * certifications, contacts). Every entry needs approvalRecordId.
   */
  supportedClaims: z.array(SupportedClaimSchema).default([]),
  /** ApprovalRecord.id for the brief itself (subject: "brief"). */
  briefApprovalRecordId: NonEmptyStringSchema,
})
  .strict()
  .superRefine((brief, ctx) => {
    const dims = brief.hardConstraints.dimensions;
    if (dims.width <= 0 || dims.height <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dimensions must be positive",
        path: ["hardConstraints", "dimensions"],
      });
    }

    // Channel / format consistency for Milestone formats
    if (
      brief.channel === "print_poster" &&
      brief.hardConstraints.formatId !== "poster"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'channel print_poster requires hardConstraints.formatId "poster"',
        path: ["hardConstraints", "formatId"],
      });
    }
    if (
      brief.channel === "print_business_card" &&
      brief.hardConstraints.formatId !== "business_card"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'channel print_business_card requires hardConstraints.formatId "business_card"',
        path: ["hardConstraints", "formatId"],
      });
    }

    const requireFor = new Set(brief.hardConstraints.requireApprovalFor);
    const checkClaim = (
      claim: z.infer<typeof SupportedClaimSchema>,
      path: (string | number)[],
    ) => {
      const subject =
        claim.kind === "other"
          ? "claim"
          : claim.kind;
      if (requireFor.has(subject) || requireFor.has("claim")) {
        if (!claim.approvalRecordId?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unsupported or unapproved ${claim.kind} claim "${claim.text}" — invented claims are rejected`,
            path,
          });
        }
      }
    };

    for (const [i, claim] of brief.supportedClaims.entries()) {
      checkClaim(claim, ["supportedClaims", i, "approvalRecordId"]);
    }
    for (const [i, claim] of brief.approvedCopy.claims.entries()) {
      checkClaim(claim, ["approvedCopy", "claims", i, "approvalRecordId"]);
    }

    if (!brief.briefApprovalRecordId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing brief approval — jobs without approvals are rejected",
        path: ["briefApprovalRecordId"],
      });
    }

    if (brief.approvedCopy.approvalStatus !== "approved") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exact approved copy is required; missing copy approval is rejected",
        path: ["approvedCopy", "approvalStatus"],
      });
    }
  });

export type DesignBrief = z.infer<typeof DesignBriefSchema>;
