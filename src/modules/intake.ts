import { z } from "zod";
import type { ApprovalRecord } from "../schemas/approval-record.js";
import type { DesignBrief } from "../schemas/design-brief.js";
import { DesignBriefSchema } from "../schemas/design-brief.js";
import type { BrandProfile } from "../schemas/brand-profile.js";
import { BrandProfileSchema } from "../schemas/brand-profile.js";
import type { DesignIntake } from "../schemas/intake.js";
import { DesignIntakeSchema } from "../schemas/intake.js";
import type { DistinctivenessAudit } from "../schemas/distinctiveness-audit.js";
import {
  assertBriefIntegrity,
  IntegrityError,
} from "../schemas/integrity.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import { scanTextsForHype, type VoiceIssue } from "../lib/voice.js";
import { exactCopyStrings } from "../schemas/approved-copy.js";

export type IntakeValidationIssue = {
  code:
    | "schema"
    | "missing_approval"
    | "integrity"
    | "hype_language"
    | "prohibited_in_copy"
    | "distinctiveness"
    | "format";
  path: string;
  message: string;
  hard: boolean;
};

export type IntakeValidationResult = {
  ok: boolean;
  intake: DesignIntake | null;
  issues: IntakeValidationIssue[];
  voiceIssues: VoiceIssue[];
  briefs: DesignBrief[];
  brandProfile: BrandProfile | null;
  distinctivenessAudit: DistinctivenessAudit | null;
};

function zodToIssues(err: z.ZodError): IntakeValidationIssue[] {
  return err.issues.map((issue) => ({
    code: "schema" as const,
    path: issue.path.join(".") || "(root)",
    message: issue.message,
    hard: true,
  }));
}

function copyContainsProhibited(
  copyTexts: readonly string[],
  prohibited: readonly string[],
): IntakeValidationIssue[] {
  const issues: IntakeValidationIssue[] = [];
  for (const ban of prohibited) {
    const needle = ban.trim().toLowerCase();
    if (!needle) continue;
    for (const line of copyTexts) {
      if (line.toLowerCase().includes(needle)) {
        issues.push({
          code: "prohibited_in_copy",
          path: "copyAndClaims.prohibitedClaims",
          message: `Approved copy contains prohibited claim language: "${ban}"`,
          hard: true,
        });
      }
    }
  }
  return issues;
}

/**
 * Validate raw intake JSON, enforce approvals/integrity, and map into
 * one DesignBrief per output format plus a BrandProfile.
 */
export function validateAndNormalizeIntake(
  raw: unknown,
  approvals: readonly ApprovalRecord[],
  options?: { now?: string; jobId?: string },
): IntakeValidationResult {
  const issues: IntakeValidationIssue[] = [];
  const parsed = DesignIntakeSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      ok: false,
      intake: null,
      issues: zodToIssues(parsed.error),
      voiceIssues: [],
      briefs: [],
      brandProfile: null,
      distinctivenessAudit: null,
    };
  }

  const intake = parsed.data;
  const now = options?.now ?? new Date().toISOString();
  const jobId = options?.jobId ?? intake.id;

  // Voice: flag hype; hard-fail when brand bans hype
  const voiceEntries = [
    { field: "offer", text: intake.offer },
    { field: "twoSecondUnderstanding", text: intake.twoSecondUnderstanding },
    { field: "nextAction", text: intake.nextAction },
    { field: "copy.headline", text: intake.copyAndClaims.approvedCopy.headline },
    {
      field: "copy.callToAction",
      text: intake.copyAndClaims.approvedCopy.callToAction,
    },
  ];
  if (intake.copyAndClaims.approvedCopy.subhead) {
    voiceEntries.push({
      field: "copy.subhead",
      text: intake.copyAndClaims.approvedCopy.subhead,
    });
  }
  if (intake.copyAndClaims.approvedCopy.body) {
    voiceEntries.push({
      field: "copy.body",
      text: intake.copyAndClaims.approvedCopy.body,
    });
  }

  const voiceIssues = scanTextsForHype(voiceEntries);
  if (voiceIssues.length > 0 && intake.brandAssets.voice.banHype) {
    for (const v of voiceIssues) {
      issues.push({
        code: "hype_language",
        path: v.field,
        message: `${v.reason} Found: "${v.excerpt}"`,
        hard: true,
      });
    }
  }

  issues.push(
    ...copyContainsProhibited(
      exactCopyStrings(intake.copyAndClaims.approvedCopy),
      intake.copyAndClaims.prohibitedClaims,
    ),
  );

  // Merge prohibited into mustExclude for each format
  const brandRaw: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    id: `${jobId}-brand`,
    createdAt: intake.createdAt,
    updatedAt: now,
    brandName: intake.brandAssets.brandName,
    voice: intake.brandAssets.voice,
    colors: intake.brandAssets.colors,
    fonts: intake.brandAssets.fonts,
    logoRules: intake.brandAssets.logoRules,
    assets: intake.brandAssets.assets,
    logos: intake.brandAssets.logos,
    certifications: [],
    licenseRecords: intake.brandAssets.licenseRecords,
    brandApprovalRecordId: intake.brandAssets.brandApprovalRecordId,
    hardConstraints: {
      mustUsePrimaryLogo: Boolean(intake.brandAssets.logoRules.primaryAssetId),
      mustUseBrandColors: true,
      forbiddenImagery: intake.creativePreferences.doAvoid,
    },
    creativePreferences: {
      moodKeywords: intake.creativePreferences.moodKeywords,
      layoutNotes: intake.creativePreferences.notes,
    },
  };
  if (intake.brandAssets.legalName) {
    brandRaw.legalName = intake.brandAssets.legalName;
  }
  if (intake.brandAssets.imageStyle) {
    brandRaw.imageStyle = intake.brandAssets.imageStyle;
  }
  if (intake.brandAssets.website) {
    brandRaw.website = intake.brandAssets.website;
  }
  if (intake.brandAssets.distinctivenessAudit?.id) {
    brandRaw.distinctivenessAuditId = intake.brandAssets.distinctivenessAudit.id;
  }

  const brandParse = BrandProfileSchema.safeParse(brandRaw);

  if (!brandParse.success) {
    issues.push(...zodToIssues(brandParse.error));
  }

  const audit = intake.brandAssets.distinctivenessAudit ?? null;
  if (audit) {
    for (const finding of audit.findings) {
      if (
        finding.recognitionHypothesis.evidenceStatus === "hypothesis" ||
        finding.uniqueAssociationHypothesis.evidenceStatus === "hypothesis"
      ) {
        // Soft note — hypotheses are expected; do not treat as proof
        issues.push({
          code: "distinctiveness",
          path: `distinctivenessAudit.findings.${finding.assetId}`,
          message:
            `Distinctiveness for "${finding.assetLabel}" remains a research hypothesis until tested. ` +
            `Do not claim viewer recognition or unique brand association as fact.`,
          hard: false,
        });
      }
    }
  }

  const briefs: DesignBrief[] = [];
  for (const output of intake.outputs) {
    const mustExclude = [
      ...output.hardConstraints.mustExcludeText,
      ...intake.copyAndClaims.prohibitedClaims,
    ];
    const mustInclude = [
      ...output.hardConstraints.mustIncludeText,
      intake.copyAndClaims.approvedCopy.headline,
      intake.copyAndClaims.approvedCopy.callToAction,
    ];

    const audience: {
      primary: string;
      secondary?: string;
      demographicsNotes: string[];
      psychographicsNotes: string[];
    } = {
      primary: intake.whoNeedsIt.primaryAudience,
      demographicsNotes: intake.whoNeedsIt.demographicsNotes,
      psychographicsNotes: intake.whoNeedsIt.psychographicsNotes,
    };
    if (intake.whoNeedsIt.secondaryAudience) {
      audience.secondary = intake.whoNeedsIt.secondaryAudience;
    }

    const briefRaw = {
      schemaVersion: SCHEMA_VERSION,
      id: `${jobId}-brief-${output.formatId}`,
      createdAt: intake.createdAt,
      updatedAt: now,
      title: `${intake.title} — ${output.label}`,
      offer: intake.offer,
      audience,
      buyingContext: {
        stage: intake.purchaseTrigger.stage,
        setting: intake.purchaseTrigger.situation,
        objections: intake.purchaseTrigger.objections,
        competitors: intake.purchaseTrigger.competitors,
      },
      objective:
        intake.objective ??
        `Help the right buyer act on: ${intake.twoSecondUnderstanding}`,
      oneMessageStatement: intake.twoSecondUnderstanding,
      desiredAction: intake.nextAction,
      prohibitedClaims: intake.copyAndClaims.prohibitedClaims,
      channel: output.channel,
      hardConstraints: {
        ...output.hardConstraints,
        mustIncludeText: [...new Set(mustInclude)],
        mustExcludeText: [...new Set(mustExclude)],
      },
      creativePreferences: intake.creativePreferences,
      approvedCopy: intake.copyAndClaims.approvedCopy,
      supportedClaims: intake.copyAndClaims.supportedClaims,
      briefApprovalRecordId: intake.briefApprovalRecordId,
    };

    const briefParse = DesignBriefSchema.safeParse(briefRaw);
    if (!briefParse.success) {
      issues.push(...zodToIssues(briefParse.error));
      continue;
    }

    try {
      assertBriefIntegrity(briefParse.data, approvals);
    } catch (err) {
      if (err instanceof IntegrityError) {
        issues.push({
          code:
            err.code === "missing_approval" || err.code === "unapproved_copy"
              ? "missing_approval"
              : "integrity",
          path: briefParse.data.id,
          message: err.message,
          hard: true,
        });
      } else {
        throw err;
      }
    }

    briefs.push(briefParse.data);
  }

  const hardIssues = issues.filter((i) => i.hard);
  const ok =
    hardIssues.length === 0 &&
    brandParse.success &&
    briefs.length === intake.outputs.length;

  return {
    ok,
    intake,
    issues,
    voiceIssues,
    briefs: ok ? briefs : briefs,
    brandProfile: brandParse.success ? brandParse.data : null,
    distinctivenessAudit: audit,
  };
}

export function parseDesignIntake(raw: unknown): DesignIntake {
  return DesignIntakeSchema.parse(raw);
}
