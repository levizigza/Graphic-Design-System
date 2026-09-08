import { z } from "zod";
import type { ApprovalRecord } from "./approval-record.js";
import { isApproved } from "./approval-record.js";
import type { ApprovedCopy } from "./approved-copy.js";
import type { DesignBrief } from "./design-brief.js";
import type { ApprovalSubject, SupportedClaim } from "./common.js";
import { ClaimKindSchema } from "./common.js";

export class IntegrityError extends Error {
  readonly code:
    | "missing_approval"
    | "invented_claim"
    | "fabricated_contact"
    | "unsupported_price"
    | "unsupported_date"
    | "unsupported_testimonial"
    | "unsupported_logo"
    | "unsupported_certification"
    | "unapproved_copy";

  constructor(
    code: IntegrityError["code"],
    message: string,
  ) {
    super(message);
    this.name = "IntegrityError";
    this.code = code;
  }
}

function claimSubject(kind: z.infer<typeof ClaimKindSchema>): ApprovalSubject {
  if (kind === "other") return "claim";
  return kind;
}

function codeForKind(
  kind: z.infer<typeof ClaimKindSchema>,
): IntegrityError["code"] {
  switch (kind) {
    case "contact":
      return "fabricated_contact";
    case "price":
      return "unsupported_price";
    case "date":
      return "unsupported_date";
    case "testimonial":
      return "unsupported_testimonial";
    case "logo":
      return "unsupported_logo";
    case "certification":
      return "unsupported_certification";
    default:
      return "invented_claim";
  }
}

function findApproval(
  records: readonly ApprovalRecord[],
  subject: ApprovalSubject,
  subjectId: string,
): ApprovalRecord | undefined {
  return records.find(
    (r) => r.subject === subject && r.subjectId === subjectId && isApproved(r),
  );
}

function assertClaimApproved(
  claim: SupportedClaim,
  records: readonly ApprovalRecord[],
): void {
  const byId = records.find(
    (r) => r.id === claim.approvalRecordId && isApproved(r),
  );
  const bySubject = findApproval(records, claimSubject(claim.kind), claim.id);

  if (!byId && !bySubject) {
    throw new IntegrityError(
      codeForKind(claim.kind),
      `Rejected ${claim.kind} "${claim.text}": no approved ApprovalRecord ` +
        `(approvalRecordId=${claim.approvalRecordId}). ` +
        `Invented claims, fabricated contact details, unsupported prices, dates, testimonials, logos, or certifications are not allowed.`,
    );
  }
}

/**
 * Fail closed: every claim and the copy bundle must resolve to an
 * approved ApprovalRecord. Call before concept generation / production.
 */
export function assertBriefIntegrity(
  brief: DesignBrief,
  approvals: readonly ApprovalRecord[],
): void {
  const copyApproval = approvals.find(
    (r) => r.id === brief.approvedCopy.approvalRecordId && isApproved(r),
  );
  if (!copyApproval) {
    throw new IntegrityError(
      "unapproved_copy",
      "Missing approval for ApprovedCopy — exact approved copy is required",
    );
  }

  const briefApproval = approvals.find(
    (r) => r.id === brief.briefApprovalRecordId && isApproved(r),
  );
  if (!briefApproval) {
    throw new IntegrityError(
      "missing_approval",
      "Missing approval for DesignBrief — jobs without approvals are rejected",
    );
  }

  for (const claim of brief.supportedClaims) {
    assertClaimApproved(claim, approvals);
  }
  for (const claim of brief.approvedCopy.claims) {
    assertClaimApproved(claim, approvals);
  }
}

export function assertCopyIntegrity(
  copy: ApprovedCopy,
  approvals: readonly ApprovalRecord[],
): void {
  const copyApproval = approvals.find(
    (r) => r.id === copy.approvalRecordId && isApproved(r),
  );
  if (!copyApproval || copy.approvalStatus !== "approved") {
    throw new IntegrityError(
      "unapproved_copy",
      "ApprovedCopy lacks a matching approved ApprovalRecord",
    );
  }
  for (const claim of copy.claims) {
    assertClaimApproved(claim, approvals);
  }
}

/**
 * Detect on-design text that looks like a price/contact/etc. but is not
 * in the supported claims allow-list. Heuristic — used by preflight.
 */
export function findUnsupportedFactualStrings(
  observedText: readonly string[],
  allowedClaimTexts: readonly string[],
): string[] {
  const allowed = new Set(allowedClaimTexts.map((t) => t.trim().toLowerCase()));
  const suspects: string[] = [];

  const patterns: RegExp[] = [
    /\$\s?\d[\d,]*(?:\.\d{2})?/, // price
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/, // date
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
    /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/, // email
    /\+?\d[\d\s().-]{7,}\d/, // phone-ish
    /\b(?:certified|iso\s?\d+|bbb\s*accredited)\b/i,
  ];

  for (const line of observedText) {
    const lower = line.trim().toLowerCase();
    if (allowed.has(lower)) continue;
    if (allowedClaimTexts.some((a) => lower.includes(a.trim().toLowerCase()))) {
      continue;
    }
    if (patterns.some((p) => p.test(line))) {
      suspects.push(line);
    }
  }
  return suspects;
}
