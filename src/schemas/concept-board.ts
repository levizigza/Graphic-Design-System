import { z } from "zod";
import { ConceptSchema, type Concept } from "./concept.js";
import {
  DocumentMetaSchema,
  NonEmptyStringSchema,
} from "./common.js";
import { SCHEMA_VERSION } from "./version.js";

export const CONCEPT_BOARD_SIZE = 6 as const;
export const MIN_DISTINCT_GOVERNING_IDEAS = 3 as const;
export const MIN_INDEPENDENT_METAPHORS = 2 as const;
export const DIRECTIONS_TO_SELECT = 2 as const;

export const ConceptBoardStatusSchema = z.enum([
  /** Six text concepts ready; waiting for operator to pick two. */
  "awaiting_selection",
  /** Two directions chosen; visual/Canva work may begin for those only. */
  "directions_selected",
  /** Board frozen after visual kickoff. */
  "locked",
]);

export type ConceptBoardStatus = z.infer<typeof ConceptBoardStatusSchema>;

export const ConceptBoardDiversityReportSchema = z
  .object({
    distinctGoverningIdeaKeys: z.number().int().nonnegative(),
    independentMetaphorKeys: z.number().int().nonnegative(),
    styleAxesUsed: z.array(NonEmptyStringSchema),
    superficialVariationFlags: z.array(NonEmptyStringSchema).default([]),
    passed: z.boolean(),
  })
  .strict();

export type ConceptBoardDiversityReport = z.infer<
  typeof ConceptBoardDiversityReportSchema
>;

/**
 * Concept board — text-only gate before images or Canva layouts.
 * Preserves all six concepts with selection/rejection provenance.
 */
export const ConceptBoardSchema = DocumentMetaSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  briefId: NonEmptyStringSchema,
  brandId: NonEmptyStringSchema,
  status: ConceptBoardStatusSchema,
  /**
   * Exactly six text-only concepts. Never six color/font tweaks.
   */
  concepts: z.array(ConceptSchema).length(CONCEPT_BOARD_SIZE),
  /** Populated when status is directions_selected or locked. */
  selectedConceptIds: z.array(NonEmptyStringSchema).max(DIRECTIONS_TO_SELECT).default([]),
  diversityReport: ConceptBoardDiversityReportSchema.optional(),
  /**
   * Operator prompt shown before any visual work.
   */
  selectionPrompt: z
    .literal(
      "Select exactly two directions for visual development. The other four stay on record with rejection reasons. Do not generate images or Canva layouts until both directions are chosen.",
    )
    .default(
      "Select exactly two directions for visual development. The other four stay on record with rejection reasons. Do not generate images or Canva layouts until both directions are chosen.",
    ),
  visualDevelopmentAllowed: z.boolean().default(false),
})
  .strict()
  .superRefine((board, ctx) => {
    const ids = new Set<string>();
    for (const [i, c] of board.concepts.entries()) {
      if (ids.has(c.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate concept id ${c.id}`,
          path: ["concepts", i, "id"],
        });
      }
      ids.add(c.id);

      if (c.briefId !== board.briefId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Concept briefId must match board briefId",
          path: ["concepts", i, "briefId"],
        });
      }
      if (c.brandId !== board.brandId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Concept brandId must match board brandId",
          path: ["concepts", i, "brandId"],
        });
      }
      if (c.medium !== "text_only") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All board concepts must be text_only",
          path: ["concepts", i, "medium"],
        });
      }
    }

    if (board.status === "awaiting_selection") {
      if (board.selectedConceptIds.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "awaiting_selection boards must not have selectedConceptIds yet",
          path: ["selectedConceptIds"],
        });
      }
      if (board.visualDevelopmentAllowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Visual development is blocked until two directions are selected",
          path: ["visualDevelopmentAllowed"],
        });
      }
      for (const [i, c] of board.concepts.entries()) {
        if (c.status === "selected" || c.status === "rejected") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Concepts stay proposed until the operator selects two directions",
            path: ["concepts", i, "status"],
          });
        }
      }
    }

    if (
      board.status === "directions_selected" ||
      board.status === "locked"
    ) {
      if (board.selectedConceptIds.length !== DIRECTIONS_TO_SELECT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Exactly ${DIRECTIONS_TO_SELECT} directions must be selected`,
          path: ["selectedConceptIds"],
        });
      }
      for (const id of board.selectedConceptIds) {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `selectedConceptId ${id} is not on this board`,
            path: ["selectedConceptIds"],
          });
        }
      }

      const selected = board.concepts.filter((c) => c.status === "selected");
      const rejected = board.concepts.filter((c) => c.status === "rejected");
      if (selected.length !== DIRECTIONS_TO_SELECT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Expected ${DIRECTIONS_TO_SELECT} selected concepts; found ${selected.length}`,
          path: ["concepts"],
        });
      }
      if (rejected.length !== CONCEPT_BOARD_SIZE - DIRECTIONS_TO_SELECT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Expected ${CONCEPT_BOARD_SIZE - DIRECTIONS_TO_SELECT} rejected concepts with reasons; found ${rejected.length}`,
          path: ["concepts"],
        });
      }
      for (const [i, c] of board.concepts.entries()) {
        if (c.status === "rejected" && !c.rejectionReason?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Every non-selected concept needs a rejectionReason",
            path: ["concepts", i, "rejectionReason"],
          });
        }
        if (c.status === "selected" && !c.selectionReason?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Every selected concept needs a selectionReason",
            path: ["concepts", i, "selectionReason"],
          });
        }
      }

      if (
        board.status === "directions_selected" &&
        !board.visualDevelopmentAllowed
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "directions_selected must set visualDevelopmentAllowed true",
          path: ["visualDevelopmentAllowed"],
        });
      }
    }
  });

export type ConceptBoard = z.infer<typeof ConceptBoardSchema>;

export function listSelectedConcepts(board: ConceptBoard): Concept[] {
  return board.concepts.filter((c) => c.status === "selected");
}

export function listRejectedConcepts(board: ConceptBoard): Concept[] {
  return board.concepts.filter((c) => c.status === "rejected");
}
