import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCHEMA_VERSION, type Concept } from "../schemas/index.js";
import {
  assertVisualDevelopmentAllowed,
  buildAwaitingBoard,
  selectConceptDirections,
  validateConceptBoard,
} from "./concept-board.js";

const now = "2026-09-08T03:40:00.000Z";

function concept(partial: {
  id: string;
  governingIdeaKey: string;
  metaphorKey: string;
  styleAxis: Concept["styleAxis"];
  oneSentenceIdea: string;
}): Concept {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: partial.id,
    createdAt: now,
    updatedAt: now,
    status: "proposed",
    medium: "text_only",
    oneSentenceIdea: partial.oneSentenceIdea,
    governingIdea: partial.oneSentenceIdea,
    governingIdeaKey: partial.governingIdeaKey,
    audienceInsight: "Buyers want a clear reason to act this week without pressure.",
    semanticConnection: `Links the offer to ${partial.governingIdeaKey}`,
    intendedEmotion: "Confidence to take the next step",
    messageHierarchy: {
      primary: "Offer headline",
      secondary: "Proof or place",
      exit: "RSVP today",
    },
    typographyBehavior: {
      behavior: "Strong lead line, restrained supporting type",
      displayRole: "Headline leads",
      pairingNotes: "Body stays quiet",
      caseTreatment: "as_written",
      weightContrast: "high",
      brandFontRolesUsed: ["headline", "body"],
    },
    imageStrategy: {
      approach: `Visual approach for ${partial.metaphorKey}`,
      metaphorKey: partial.metaphorKey,
      metaphorDescription: `Metaphor: ${partial.metaphorKey}`,
      dependsOnReference: false,
    },
    likelyMisconception: "Could be skimmed as generic event promo",
    productionRisks: ["Needs approved copy lock before layout"],
    distinctivenessHypothesis: `Hypothesis: ${partial.governingIdeaKey} reads as Studio North, not category wallpaper`,
    styleAxis: partial.styleAxis,
    references: [],
    briefId: "brief-1",
    brandId: "brand-1",
  };
}

function sixDiverseConcepts(): Concept[] {
  return [
    concept({
      id: "c1",
      governingIdeaKey: "threshold",
      metaphorKey: "open_door",
      styleAxis: "environment_atmosphere",
      oneSentenceIdea: "An open studio door turns Friday into a low-pressure visit.",
    }),
    concept({
      id: "c2",
      governingIdeaKey: "proof_of_craft",
      metaphorKey: "tool_flatlay",
      styleAxis: "object_symbol",
      oneSentenceIdea: "Honest tools on the bench prove the work is real and local.",
    }),
    concept({
      id: "c3",
      governingIdeaKey: "social_arrival",
      metaphorKey: "crowd_arrival",
      styleAxis: "human_moment",
      oneSentenceIdea: "Neighbors arriving together make the night feel easy to join.",
    }),
    concept({
      id: "c4",
      governingIdeaKey: "editorial_invite",
      metaphorKey: "magazine_cover",
      styleAxis: "typographic_system",
      oneSentenceIdea: "A cover-style type system announces the night like a special issue.",
    }),
    concept({
      id: "c5",
      governingIdeaKey: "process_map",
      metaphorKey: "step_diagram",
      styleAxis: "diagram_explainer",
      oneSentenceIdea: "A simple path from arrive to RSVP removes guesswork.",
    }),
    concept({
      id: "c6",
      governingIdeaKey: "threshold",
      metaphorKey: "lit_window",
      styleAxis: "narrative_scene",
      oneSentenceIdea: "A lit window at dusk signals the studio is open tonight.",
    }),
  ];
}

describe("concept board gate", () => {
  it("accepts six text-only concepts with diversity rules", () => {
    const result = buildAwaitingBoard({
      id: "board-1",
      briefId: "brief-1",
      brandId: "brand-1",
      concepts: sixDiverseConcepts(),
      createdAt: now,
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
    assert.equal(result.board?.status, "awaiting_selection");
    assert.equal(result.board?.visualDevelopmentAllowed, false);
    assert.ok((result.diversity?.distinctGoverningIdeaKeys ?? 0) >= 3);
    assert.ok((result.diversity?.independentMetaphorKeys ?? 0) >= 2);
  });

  it("rejects six color/font variations posing as concepts", () => {
    const base = sixDiverseConcepts()[0]!;
    const clones = [1, 2, 3, 4, 5, 6].map((n) => ({
      ...base,
      id: `clone-${n}`,
      oneSentenceIdea: `Same open door concept with palette ${n} and a bolder font`,
      governingIdea: `Same open door concept with palette ${n} and a bolder font`,
      governingIdeaKey: "threshold",
      imageStrategy: {
        ...base.imageStrategy,
        metaphorKey: "open_door",
        approach: `Same door photo, color grade ${n}`,
      },
      styleAxis: "environment_atmosphere" as const,
      typographyBehavior: {
        ...base.typographyBehavior,
        behavior: `Same layout, font weight tweak ${n}`,
      },
    }));
    const result = buildAwaitingBoard({
      id: "board-weak",
      briefId: "brief-1",
      brandId: "brand-1",
      concepts: clones,
      createdAt: now,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (i) =>
          i.code === "diversity_governing_ideas" ||
          i.code === "superficial_variation" ||
          i.code === "diversity_metaphors" ||
          i.code === "style_diversity",
      ),
    );
  });

  it("blocks visual development until two directions are selected", () => {
    const built = buildAwaitingBoard({
      id: "board-1",
      briefId: "brief-1",
      brandId: "brand-1",
      concepts: sixDiverseConcepts(),
      createdAt: now,
    });
    assert.ok(built.board);
    assert.throws(() => assertVisualDevelopmentAllowed(built.board!));

    const selected = selectConceptDirections(built.board!, {
      selectedIds: ["c1", "c4"],
      selectionReasons: {
        c1: "Strong visit trigger for walk-by audience",
        c4: "Typographic direction contrasts the photographic one",
      },
      rejectionReasons: {
        c2: "Too object-led for this poster moment",
        c3: "Crowd scene risks stock-photo feel",
        c5: "Diagram is clearer for web than print poster",
        c6: "Overlaps the threshold idea already selected in c1",
      },
      now,
    });
    assert.equal(selected.ok, true, JSON.stringify(selected.issues, null, 2));
    assert.equal(selected.board?.status, "directions_selected");
    assert.equal(selected.board?.selectedConceptIds.length, 2);
    assert.equal(selected.board?.visualDevelopmentAllowed, true);
    assert.equal(
      selected.board?.concepts.filter((c) => c.status === "rejected").length,
      4,
    );
    for (const c of selected.board!.concepts) {
      if (c.status === "rejected") assert.ok(c.rejectionReason);
      if (c.status === "selected") assert.ok(c.selectionReason);
    }
    assert.doesNotThrow(() => assertVisualDevelopmentAllowed(selected.board!));
  });

  it("requires rejection reasons for non-selected concepts", () => {
    const built = buildAwaitingBoard({
      id: "board-1",
      briefId: "brief-1",
      brandId: "brand-1",
      concepts: sixDiverseConcepts(),
      createdAt: now,
    });
    const selected = selectConceptDirections(built.board!, {
      selectedIds: ["c1", "c2"],
      selectionReasons: {
        c1: "Clear visit story",
        c2: "Craft proof is credible",
      },
      rejectionReasons: {
        c3: "Not advancing",
        // c4–c6 missing on purpose
      },
      now,
    });
    assert.equal(selected.ok, false);
    assert.ok(selected.issues.some((i) => i.path.includes("rejectionReason") || i.code === "schema"));
  });

  it("rejects premature visualDevelopmentAllowed on awaiting boards", () => {
    const concepts = sixDiverseConcepts();
    const result = validateConceptBoard({
      schemaVersion: SCHEMA_VERSION,
      id: "board-1",
      createdAt: now,
      updatedAt: now,
      briefId: "brief-1",
      brandId: "brand-1",
      status: "awaiting_selection",
      concepts,
      selectedConceptIds: [],
      visualDevelopmentAllowed: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "schema" || i.code === "premature_visual"));
  });
});
