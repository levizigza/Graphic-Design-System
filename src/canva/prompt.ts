import type { DesignSpec } from "../schemas/design-spec.js";
import type { ApprovedCopy } from "../schemas/approved-copy.js";
import { exactCopyStrings } from "../schemas/approved-copy.js";

/**
 * Build a generation prompt from an approved DesignSpec.
 * Uses only approved copy and declared constraints — never invents claims.
 */
export function buildGenerationPromptFromSpec(
  spec: DesignSpec,
  approvedCopy: ApprovedCopy,
  options?: { conceptOneLiner?: string },
): string {
  const dims = spec.hardConstraints.dimensions;
  const lines = [
    `Create a professional marketing design.`,
    `Format: ${spec.hardConstraints.formatId} (${dims.width}×${dims.height} ${dims.unit}).`,
    `Locale: ${spec.hardConstraints.localization.locale}.`,
  ];

  if (options?.conceptOneLiner) {
    lines.push(`Creative direction (text-approved concept): ${options.conceptOneLiner}`);
  }

  lines.push(`Exact headline: ${approvedCopy.headline}`);
  if (approvedCopy.subhead) lines.push(`Exact subhead: ${approvedCopy.subhead}`);
  if (approvedCopy.body) lines.push(`Exact body: ${approvedCopy.body}`);
  lines.push(`Exact CTA: ${approvedCopy.callToAction}`);

  for (const [role, text] of Object.entries(approvedCopy.lockedLines)) {
    lines.push(`Locked ${role}: ${text}`);
  }
  for (const claim of approvedCopy.claims) {
    lines.push(`Approved ${claim.kind}: ${claim.text}`);
  }

  if (spec.hardConstraints.mustExcludeText.length) {
    lines.push(
      `Do not include: ${spec.hardConstraints.mustExcludeText.join("; ")}`,
    );
  }
  if (spec.productionNotes.length) {
    lines.push(`Production notes: ${spec.productionNotes.join("; ")}`);
  }

  lines.push(
    "Use only the exact approved copy and claims listed. Do not invent prices, dates, testimonials, logos, certifications, or contact details.",
  );
  lines.push(
    `Must include these strings: ${exactCopyStrings(approvedCopy).join(" | ")}`,
  );

  if (spec.hardConstraints.accessibility.minContrastRatio) {
    lines.push(
      `Accessibility: aim for contrast ≥ ${spec.hardConstraints.accessibility.minContrastRatio}:1.`,
    );
  }
  if (spec.hardConstraints.printer.required) {
    lines.push(
      `Print: bleed ${spec.hardConstraints.printer.bleedInches ?? 0} in, safe margin ${spec.hardConstraints.printer.safeMarginInches ?? 0} in, color ${spec.hardConstraints.printer.colorMode ?? "as appropriate"}.`,
    );
  }

  return lines.join("\n");
}
