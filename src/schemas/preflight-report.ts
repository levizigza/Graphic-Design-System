import { z } from "zod";
import {
  DocumentMetaSchema,
  NonEmptyStringSchema,
  UrlSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

export const PreflightCheckStatusSchema = z.enum(["pass", "warn", "fail"]);

export const PreflightSeveritySchema = z.enum([
  "blocker",
  "major",
  "minor",
  "info",
]);

export type PreflightSeverity = z.infer<typeof PreflightSeveritySchema>;

export const PreflightCategorySchema = z.enum([
  "copy",
  "spelling",
  "claims",
  "overflow",
  "type_size",
  "hierarchy",
  "cta",
  "logo",
  "contrast",
  "safe_area",
  "bleed",
  "image_resolution",
  "dimensions",
  "qr",
  "license",
  "export",
  "printer",
  "handoff",
  "brand",
  "assets",
  "other",
]);

export type PreflightCategory = z.infer<typeof PreflightCategorySchema>;

export const PreflightLocationSchema = z
  .object({
    pageIndex: z.number().int().positive().optional(),
    elementId: NonEmptyStringSchema.optional(),
    region: NonEmptyStringSchema.optional(),
    field: NonEmptyStringSchema.optional(),
  })
  .strict();

export type PreflightLocation = z.infer<typeof PreflightLocationSchema>;

/**
 * Single preflight finding. Failures must carry severity, location,
 * evidence, and a suggested correction.
 */
export const PreflightCheckSchema = z
  .object({
    id: NonEmptyStringSchema,
    category: PreflightCategorySchema,
    status: PreflightCheckStatusSchema,
    severity: PreflightSeveritySchema,
    message: NonEmptyStringSchema,
    /** True = hard constraint; blocks approval when status=fail. */
    hard: z.boolean(),
    location: PreflightLocationSchema.default({}),
    evidence: NonEmptyStringSchema,
    suggestedCorrection: NonEmptyStringSchema,
  })
  .strict()
  .superRefine((check, ctx) => {
    if (check.status === "fail") {
      if (!check.evidence.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Failures require evidence",
          path: ["evidence"],
        });
      }
      if (!check.suggestedCorrection.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Failures require suggestedCorrection",
          path: ["suggestedCorrection"],
        });
      }
      if (check.severity === "info") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Failures cannot use severity=info",
          path: ["severity"],
        });
      }
    }
  });

/**
 * Preflight report produced before approval.
 * Any hard fail blocks approval/export.
 * Never sets printReady=true unless bleed, crop marks, color profile, and proofing are verified.
 */
export const PreflightReportSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  renderResultId: NonEmptyStringSchema,
  designSpecId: NonEmptyStringSchema,
  designId: NonEmptyStringSchema.nullable().default(null),
  editUrl: z.union([UrlSchema, z.null()]).default(null),
  outputKind: z.enum(["digital", "print", "hybrid"]).default("digital"),
  contrastStandard: z
    .enum(["wcag_2_2_aa", "wcag_2_2_aaa", "custom_print"])
    .default("wcag_2_2_aa"),
  checks: z.array(PreflightCheckSchema).min(1),
  hardFailCount: z.number().int().min(0),
  warnCount: z.number().int().min(0),
  outcome: z.enum(["pass", "pass_with_warnings", "fail"]),
  /** Explicit gate — never claim print-ready without verified print proofs. */
  printReady: z.boolean().default(false),
  printReadyBlockers: z.array(NonEmptyStringSchema).default([]),
  approvalAllowed: z.boolean(),
  observedText: z.array(NonEmptyStringSchema).default([]),
  summary: NonEmptyStringSchema,
})
  .strict()
  .superRefine((report, ctx) => {
    const hardFails = report.checks.filter((c) => c.hard && c.status === "fail");
    const warns = report.checks.filter((c) => c.status === "warn");

    if (hardFails.length !== report.hardFailCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `hardFailCount ${report.hardFailCount} does not match ${hardFails.length} hard fails`,
        path: ["hardFailCount"],
      });
    }
    if (warns.length !== report.warnCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `warnCount ${report.warnCount} does not match ${warns.length} warnings`,
        path: ["warnCount"],
      });
    }

    if (hardFails.length > 0 && report.outcome !== "fail") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "outcome must be fail when any hard check fails",
        path: ["outcome"],
      });
    }
    if (
      hardFails.length === 0 &&
      warns.length > 0 &&
      report.outcome === "pass"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "use pass_with_warnings when soft warnings exist",
        path: ["outcome"],
      });
    }

    if (report.outcome === "fail" && report.approvalAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approvalAllowed must be false when outcome is fail",
        path: ["approvalAllowed"],
      });
    }

    if (report.printReady) {
      const required = [
        "bleed_verified",
        "crop_marks_verified",
        "color_profile_verified",
        "proofing_verified",
      ];
      for (const key of required) {
        if (!report.printReadyBlockers.includes(`cleared:${key}`)) {
          // printReadyBlockers should list cleared keys when ready; alternatively empty blockers + flags
        }
      }
      // Enforce: cannot be printReady if any print verification missing from summary notes
      if (report.printReadyBlockers.some((b) => !b.startsWith("cleared:"))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "printReady cannot be true while unresolved printReadyBlockers remain (bleed, crop marks, color profile, proofing)",
          path: ["printReady"],
        });
      }
      const cleared = new Set(
        report.printReadyBlockers
          .filter((b) => b.startsWith("cleared:"))
          .map((b) => b.slice("cleared:".length)),
      );
      for (const key of [
        "bleed_verified",
        "crop_marks_verified",
        "color_profile_verified",
        "proofing_verified",
      ]) {
        if (!cleared.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Cannot label print ready without cleared:${key}`,
            path: ["printReady"],
          });
        }
      }
    }
  });

export type PreflightReport = z.infer<typeof PreflightReportSchema>;
export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;
