import { contrastRatio } from "../lib/contrast.js";
import { DEFAULT_PRINT_CONTRAST } from "../lib/contrast.js";

/**
 * Validation rule converted from pilot failure F-preflight-business_card.
 * Brand accent used as CTA fill must meet print contrast with CTA text color
 * before visual development — catches kiln-orange + white failures early.
 */
export class BrandCtaContrastError extends Error {
  readonly code = "brand_cta_contrast" as const;
  constructor(message: string) {
    super(message);
    this.name = "BrandCtaContrastError";
  }
}

export function assertBrandCtaContrast(input: {
  ctaForegroundHex: string;
  ctaBackgroundHex: string;
  /** Defaults to print normal-text threshold (4.5). */
  minRatio?: number;
  context?: string;
}): number {
  const minRatio = input.minRatio ?? DEFAULT_PRINT_CONTRAST.normalText;
  const ratio = contrastRatio(input.ctaForegroundHex, input.ctaBackgroundHex);
  if (ratio + 1e-9 < minRatio) {
    throw new BrandCtaContrastError(
      `CTA contrast ${ratio.toFixed(2)}:1 < ${minRatio}:1` +
        (input.context ? ` (${input.context})` : "") +
        ` — fg ${input.ctaForegroundHex} on bg ${input.ctaBackgroundHex}`,
    );
  }
  return ratio;
}

/** Studio North kiln orange fails white CTA text; use darkened kiln for fills. */
export const STUDIO_NORTH_CTA_FILL = "#8B3416";
export const STUDIO_NORTH_CTA_TEXT = "#FFFFFF";
