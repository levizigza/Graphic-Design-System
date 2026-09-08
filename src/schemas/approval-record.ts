import { z } from "zod";
import {
  DocumentMetaSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ApprovalStatusSchema,
  ApprovalSubjectSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

/**
 * Durable approval gate. Designs and claims may only use subjects
 * that have status === "approved". Missing or non-approved records
 * cause parse/refinement failure upstream.
 */
export const ApprovalRecordSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  subject: ApprovalSubjectSchema,
  /** Opaque id of the approved artifact (copy block id, claim id, design id, …). */
  subjectId: NonEmptyStringSchema,
  status: ApprovalStatusSchema,
  approvedBy: NonEmptyStringSchema.optional(),
  approvedAt: IsoDateTimeSchema.optional(),
  rejectedBy: NonEmptyStringSchema.optional(),
  rejectedAt: IsoDateTimeSchema.optional(),
  notes: z.array(NonEmptyStringSchema).default([]),
  /** Content hash or verbatim snapshot of what was approved. */
  approvedPayloadDigest: NonEmptyStringSchema.optional(),
})
  .strict()
  .superRefine((rec, ctx) => {
    if (rec.status === "approved") {
      if (!rec.approvedBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "approvedBy is required when status is approved",
          path: ["approvedBy"],
        });
      }
      if (!rec.approvedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "approvedAt is required when status is approved",
          path: ["approvedAt"],
        });
      }
    }
    if (rec.status === "rejected") {
      if (!rec.rejectedBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rejectedBy is required when status is rejected",
          path: ["rejectedBy"],
        });
      }
    }
  });

export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export function isApproved(record: ApprovalRecord): boolean {
  return record.status === "approved";
}

export function requireApproved(
  records: readonly ApprovalRecord[],
  subject: z.infer<typeof ApprovalSubjectSchema>,
  subjectId: string,
): ApprovalRecord {
  const match = records.find(
    (r) => r.subject === subject && r.subjectId === subjectId && r.status === "approved",
  );
  if (!match) {
    throw new Error(
      `Missing approval: subject=${subject} subjectId=${subjectId}. ` +
        `Invented claims, copy, contacts, prices, dates, testimonials, logos, or certifications are rejected.`,
    );
  }
  return match;
}
