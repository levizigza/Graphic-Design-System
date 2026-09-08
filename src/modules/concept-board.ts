import type { BrandProfile } from "../schemas/brand-profile.js";
import type { Concept } from "../schemas/concept.js";
import { normalizeConceptFields } from "../schemas/concept.js";
import {
  CONCEPT_BOARD_SIZE,
  ConceptBoardSchema,
  DIRECTIONS_TO_SELECT,
  MIN_DISTINCT_GOVERNING_IDEAS,
  MIN_INDEPENDENT_METAPHORS,
  type ConceptBoard,
  type ConceptBoardDiversityReport,
} from "../schemas/concept-board.js";
import { SCHEMA_VERSION } from "../schemas/version.js";

export type ConceptBoardIssue = {
  code:
    | "schema"
    | "count"
    | "diversity_governing_ideas"
    | "diversity_metaphors"
    | "superficial_variation"
    | "style_diversity"
    | "brand_respect"
    | "selection"
    | "premature_visual";
  path: string;
  message: string;
  hard: boolean;
};

export type ConceptBoardValidationResult = {
  ok: boolean;
  board: ConceptBoard | null;
  issues: ConceptBoardIssue[];
  diversity: ConceptBoardDiversityReport | null;
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Detect pairs that only differ by color/font/cosmetic language.
 * Genuine concepts need different governing ideas or metaphors.
 */
export function findSuperficialVariationFlags(concepts: readonly Concept[]): string[] {
  const flags: string[] = [];
  const cosmetic =
    /\b(color|colour|palette|font|typeface|weight|italic|bold|hex|#[0-9a-f]{3,8})\b/i;

  for (let i = 0; i < concepts.length; i += 1) {
    for (let j = i + 1; j < concepts.length; j += 1) {
      const a = concepts[i]!;
      const b = concepts[j]!;
      const sameIdea =
        normalizeKey(a.governingIdeaKey) === normalizeKey(b.governingIdeaKey);
      const sameMetaphor =
        normalizeKey(a.imageStrategy.metaphorKey) ===
        normalizeKey(b.imageStrategy.metaphorKey);
      const ideaSim = jaccard(
        tokenSet(a.oneSentenceIdea),
        tokenSet(b.oneSentenceIdea),
      );
      const onlyCosmeticHint =
        cosmetic.test(a.oneSentenceIdea) ||
        cosmetic.test(b.oneSentenceIdea) ||
        cosmetic.test(a.typographyBehavior.behavior) ||
        cosmetic.test(b.typographyBehavior.behavior);

      if (sameIdea && sameMetaphor) {
        flags.push(
          `${a.id}↔${b.id}: same governingIdeaKey and metaphorKey — not genuinely different`,
        );
      } else if (sameIdea && ideaSim >= 0.72) {
        flags.push(
          `${a.id}↔${b.id}: near-duplicate ideas under the same governingIdeaKey`,
        );
      } else if (sameMetaphor && ideaSim >= 0.65 && onlyCosmeticHint) {
        flags.push(
          `${a.id}↔${b.id}: looks like a color/font variation of the same metaphor — not a distinct concept`,
        );
      } else if (
        a.styleAxis === b.styleAxis &&
        sameMetaphor &&
        ideaSim >= 0.6
      ) {
        flags.push(
          `${a.id}↔${b.id}: shared style axis and metaphor with highly similar wording`,
        );
      }
    }
  }
  return flags;
}

export function computeDiversityReport(
  concepts: readonly Concept[],
): ConceptBoardDiversityReport {
  const ideaKeys = new Set(
    concepts.map((c) => normalizeKey(c.governingIdeaKey)).filter(Boolean),
  );
  const metaphorKeys = new Set(
    concepts.map((c) => normalizeKey(c.imageStrategy.metaphorKey)).filter(Boolean),
  );
  const styleAxes = [...new Set(concepts.map((c) => c.styleAxis))];
  const superficialVariationFlags = findSuperficialVariationFlags(concepts);

  const passed =
    ideaKeys.size >= MIN_DISTINCT_GOVERNING_IDEAS &&
    metaphorKeys.size >= MIN_INDEPENDENT_METAPHORS &&
    superficialVariationFlags.length === 0 &&
    styleAxes.length >= 3;

  return {
    distinctGoverningIdeaKeys: ideaKeys.size,
    independentMetaphorKeys: metaphorKeys.size,
    styleAxesUsed: styleAxes,
    superficialVariationFlags,
    passed,
  };
}

function brandRespectIssues(
  concepts: readonly Concept[],
  brand: BrandProfile | null | undefined,
): ConceptBoardIssue[] {
  if (!brand) return [];
  const issues: ConceptBoardIssue[] = [];
  const forbidden = new Set(
    [
      ...brand.hardConstraints.forbiddenImagery,
      ...brand.imageStyle?.doAvoid ?? [],
      ...brand.voice.dontSay,
    ].map((s) => s.toLowerCase()),
  );

  for (const c of concepts) {
    const blob = [
      c.oneSentenceIdea,
      c.imageStrategy.approach,
      c.imageStrategy.metaphorDescription,
    ]
      .join(" ")
      .toLowerCase();
    for (const ban of forbidden) {
      if (ban && blob.includes(ban)) {
        issues.push({
          code: "brand_respect",
          path: `concepts.${c.id}`,
          message: `Concept conflicts with brand avoidances ("${ban}")`,
          hard: true,
        });
      }
    }
  }
  return issues;
}

/**
 * Validate a six-concept text board before any visual or Canva work.
 */
export function validateConceptBoard(
  raw: unknown,
  options?: { brand?: BrandProfile },
): ConceptBoardValidationResult {
  const issues: ConceptBoardIssue[] = [];
  const parsed = ConceptBoardSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      board: null,
      issues: parsed.error.issues.map((i) => ({
        code: "schema",
        path: i.path.join(".") || "(root)",
        message: i.message,
        hard: true,
      })),
      diversity: null,
    };
  }

  const board = {
    ...parsed.data,
    concepts: parsed.data.concepts.map((c) => normalizeConceptFields(c)),
  };
  const diversity = computeDiversityReport(board.concepts);

  if (board.concepts.length !== CONCEPT_BOARD_SIZE) {
    issues.push({
      code: "count",
      path: "concepts",
      message: `Concept board requires exactly ${CONCEPT_BOARD_SIZE} text-only concepts`,
      hard: true,
    });
  }

  if (diversity.distinctGoverningIdeaKeys < MIN_DISTINCT_GOVERNING_IDEAS) {
    issues.push({
      code: "diversity_governing_ideas",
      path: "governingIdeaKey",
      message: `Need at least ${MIN_DISTINCT_GOVERNING_IDEAS} genuinely different governing ideas; found ${diversity.distinctGoverningIdeaKeys}`,
      hard: true,
    });
  }

  if (diversity.independentMetaphorKeys < MIN_INDEPENDENT_METAPHORS) {
    issues.push({
      code: "diversity_metaphors",
      path: "imageStrategy.metaphorKey",
      message: `Need at least ${MIN_INDEPENDENT_METAPHORS} concepts that do not share the same visual metaphor/reference; found ${diversity.independentMetaphorKeys} distinct metaphor keys`,
      hard: true,
    });
  }

  if (diversity.styleAxesUsed.length < 3) {
    issues.push({
      code: "style_diversity",
      path: "styleAxis",
      message: `Keep concepts stylistically diverse (at least 3 style axes). Found: ${diversity.styleAxesUsed.join(", ") || "(none)"}`,
      hard: true,
    });
  }

  for (const flag of diversity.superficialVariationFlags) {
    issues.push({
      code: "superficial_variation",
      path: "concepts",
      message: flag,
      hard: true,
    });
  }

  issues.push(...brandRespectIssues(board.concepts, options?.brand));

  if (board.status === "awaiting_selection" && board.visualDevelopmentAllowed) {
    issues.push({
      code: "premature_visual",
      path: "visualDevelopmentAllowed",
      message: "Do not generate images or Canva layouts before selecting two directions",
      hard: true,
    });
  }

  const boardWithReport: ConceptBoard = {
    ...board,
    diversityReport: diversity,
  };

  const hard = issues.filter((i) => i.hard);
  return {
    ok: hard.length === 0 && diversity.passed,
    board: boardWithReport,
    issues,
    diversity,
  };
}

export type DirectionSelectionInput = {
  selectedIds: readonly [string, string];
  selectionReasons: Record<string, string>;
  rejectionReasons: Record<string, string>;
  now?: string;
};

/**
 * Operator selects exactly two directions. All six concepts remain on the board
 * with selection or rejection reasons preserved.
 */
export function selectConceptDirections(
  board: ConceptBoard,
  input: DirectionSelectionInput,
): ConceptBoardValidationResult {
  const [a, b] = input.selectedIds;
  if (a === b) {
    return {
      ok: false,
      board: null,
      issues: [
        {
          code: "selection",
          path: "selectedConceptIds",
          message: "Select two different concept ids",
          hard: true,
        },
      ],
      diversity: board.diversityReport ?? null,
    };
  }

  const selectedSet = new Set(input.selectedIds);
  if (selectedSet.size !== DIRECTIONS_TO_SELECT) {
    return {
      ok: false,
      board: null,
      issues: [
        {
          code: "selection",
          path: "selectedConceptIds",
          message: `Select exactly ${DIRECTIONS_TO_SELECT} directions`,
          hard: true,
        },
      ],
      diversity: board.diversityReport ?? null,
    };
  }

  const now = input.now ?? new Date().toISOString();
  const concepts: Concept[] = board.concepts.map((c) => {
    if (selectedSet.has(c.id)) {
      const selectionReason = input.selectionReasons[c.id]?.trim();
      if (!selectionReason) {
        return {
          ...c,
          status: "selected" as const,
          selectionReason: "",
          updatedAt: now,
        };
      }
      const { rejectionReason: _r, ...rest } = c;
      return {
        ...rest,
        status: "selected" as const,
        selectionReason,
        updatedAt: now,
      };
    }
    const rejectionReason = input.rejectionReasons[c.id]?.trim();
    const { selectionReason: _s, ...rest } = c;
    return {
      ...rest,
      status: "rejected" as const,
      rejectionReason: rejectionReason ?? "",
      updatedAt: now,
    };
  });

  const nextRaw = {
    ...board,
    status: "directions_selected" as const,
    selectedConceptIds: [a, b],
    concepts,
    visualDevelopmentAllowed: true,
    updatedAt: now,
  };

  // Drop empty optional reasons that fail NonEmptyString before parse
  const sanitized = {
    ...nextRaw,
    concepts: concepts.map((c) => {
      if (c.status === "selected") {
        const { rejectionReason: _, ...rest } = c as Concept & {
          rejectionReason?: string;
        };
        return rest;
      }
      const { selectionReason: _, ...rest } = c as Concept & {
        selectionReason?: string;
      };
      return rest;
    }),
  };

  return validateConceptBoard(sanitized);
}

/**
 * Hard gate: images / Canva layouts only after two directions are selected.
 */
export function assertVisualDevelopmentAllowed(board: ConceptBoard): void {
  if (
    board.status !== "directions_selected" &&
    board.status !== "locked"
  ) {
    throw new Error(
      "Premature commitment blocked: produce and review six text-only concepts, then select two directions before images or Canva layouts.",
    );
  }
  if (!board.visualDevelopmentAllowed) {
    throw new Error("visualDevelopmentAllowed is false — Canva production is blocked");
  }
  if (board.selectedConceptIds.length !== DIRECTIONS_TO_SELECT) {
    throw new Error(`Select exactly ${DIRECTIONS_TO_SELECT} directions first`);
  }
}

export function buildAwaitingBoard(input: {
  id: string;
  briefId: string;
  brandId: string;
  concepts: Concept[];
  createdAt: string;
  updatedAt?: string;
}): ConceptBoardValidationResult {
  return validateConceptBoard({
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    briefId: input.briefId,
    brandId: input.brandId,
    status: "awaiting_selection",
    concepts: input.concepts,
    selectedConceptIds: [],
    visualDevelopmentAllowed: false,
  });
}
