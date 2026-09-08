/**
 * Language rules for Graphic Design System operator and customer-facing copy.
 * Polished, confident, human, clear, sales-focused — without hype.
 * Never invent facts.
 */

export const VOICE_PRINCIPLES = [
  "polished",
  "confident",
  "human",
  "clear",
  "sales-focused",
] as const;

/** Phrases that read as hype; flag rather than auto-rewrite facts. */
export const HYPE_PATTERNS: RegExp[] = [
  /\brevolutionary\b/i,
  /\bworld[\s-]?class\b/i,
  /\bguaranteed results?\b/i,
  /\bbest (?:ever|in class|in the world)\b/i,
  /\b#\s*1\b/i,
  /\bnumber one\b/i,
  /\bmiracle\b/i,
  /\bexclusive secret\b/i,
  /\bunbelievable\b/i,
  /\bgame[\s-]?chang(?:er|ing)\b/i,
  /\bdisrupt(?:ive|ion)\b/i,
  /\bepic\b/i,
  /\binsane\b/i,
  /\bcrush(?:es|ing)? (?:it|the competition)\b/i,
];

export type VoiceIssue = {
  field: string;
  excerpt: string;
  reason: string;
};

export function findHypeLanguage(
  text: string,
  field: string,
): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  for (const pattern of HYPE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({
        field,
        excerpt: match[0],
        reason:
          "Hype language weakens trust. Prefer clear, confident, factual wording.",
      });
    }
  }
  return issues;
}

export function scanTextsForHype(
  entries: ReadonlyArray<{ field: string; text: string }>,
): VoiceIssue[] {
  return entries.flatMap((e) => findHypeLanguage(e.text, e.field));
}
