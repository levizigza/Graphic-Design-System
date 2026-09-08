/**
 * WCAG 2.2 contrast helpers for digital output.
 * Print thresholds are project-configurable and separate.
 */

export type ContrastLevel = "AA" | "AAA";

export type ContrastRequirement = {
  normalText: number;
  largeText: number;
  uiOrGraphics: number;
};

/** WCAG 2.2 relative luminance thresholds (success criterion 1.4.3 / 1.4.6 / 1.4.11). */
export const WCAG_2_2_AA: ContrastRequirement = {
  normalText: 4.5,
  largeText: 3,
  uiOrGraphics: 3,
};

export const WCAG_2_2_AAA: ContrastRequirement = {
  normalText: 7,
  largeText: 4.5,
  uiOrGraphics: 3,
};

/** Default print guidance — override per project; not WCAG. */
export const DEFAULT_PRINT_CONTRAST: ContrastRequirement = {
  normalText: 4.5,
  largeText: 3,
  uiOrGraphics: 3,
};

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance per WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const R = channelToLinear(r);
  const G = channelToLinear(g);
  const B = channelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const L1 = relativeLuminance(foregroundHex);
  const L2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Large text under WCAG: at least 18pt regular or 14pt bold.
 */
export function isLargeText(input: {
  fontSizePt: number;
  bold?: boolean;
}): boolean {
  if (input.fontSizePt >= 18) return true;
  if (input.bold && input.fontSizePt >= 14) return true;
  return false;
}

export function requiredContrastRatio(input: {
  standard: ContrastRequirement;
  kind: "normalText" | "largeText" | "uiOrGraphics";
}): number {
  return input.standard[input.kind];
}

export function resolveDigitalContrastStandard(
  level: ContrastLevel = "AA",
): ContrastRequirement {
  return level === "AAA" ? WCAG_2_2_AAA : WCAG_2_2_AA;
}
