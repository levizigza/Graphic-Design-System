import { z } from "zod";
import {
  DocumentMetaSchema,
  NonEmptyStringSchema,
  SupportedClaimSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Exact approved copy lock. Only these strings may appear as marketing copy.
 * Contact lines must come from approved claims — never fabricated.
 */
export const ApprovedCopySchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Primary headline — exact. */
  headline: NonEmptyStringSchema,
  /** Optional subhead — exact when present. */
  subhead: NonEmptyStringSchema.optional(),
  /** Supporting body — exact when present. */
  body: NonEmptyStringSchema.optional(),
  /** CTA label — exact. */
  callToAction: NonEmptyStringSchema,
  /**
   * Additional locked lines (taglines, legal, addresses) keyed by role.
   * Values are exact strings; roles are free-form but stable.
   */
  lockedLines: z
    .record(NonEmptyStringSchema, NonEmptyStringSchema)
    .default({}),
  /**
   * Factual fragments that appear in or alongside copy.
   * Each must carry approvalRecordId; unsupported prices/dates/etc. fail.
   */
  claims: z.array(SupportedClaimSchema).default([]),
  /** ApprovalRecord.id that approved this copy bundle (subject: "copy"). */
  approvalRecordId: NonEmptyStringSchema,
  /** Denormalized approval status echo for quick checks; must be "approved". */
  approvalStatus: z.literal("approved"),
})
  .strict()
  .superRefine((copy, ctx) => {
    if (copy.approvalStatus !== "approved") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ApprovedCopy.approvalStatus must be approved; missing approvals are rejected",
        path: ["approvalStatus"],
      });
    }
    for (const [i, claim] of copy.claims.entries()) {
      if (!claim.approvalRecordId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Claim ${claim.id} (${claim.kind}) lacks approvalRecordId — invented/unsupported claims are rejected`,
          path: ["claims", i, "approvalRecordId"],
        });
      }
    }
  });

export type ApprovedCopy = z.infer<typeof ApprovedCopySchema>;

/** Flatten exact strings that preflight must find on-design. */
export function exactCopyStrings(copy: ApprovedCopy): string[] {
  const lines = [copy.headline, copy.callToAction];
  if (copy.subhead) lines.push(copy.subhead);
  if (copy.body) lines.push(copy.body);
  lines.push(...Object.values(copy.lockedLines));
  lines.push(...copy.claims.map((c) => c.text));
  return lines;
}
