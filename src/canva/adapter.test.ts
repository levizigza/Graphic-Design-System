import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CanvaAdapter } from "./adapter.js";
import type { CanvaMcpClient, CanvaMcpCallResult } from "./client.js";
import { CanvaAdapterError } from "./errors.js";
import { discoverCanvaTools } from "./discovery.js";
import { validateAccountCapabilities } from "./capabilities.js";
import { assertNotReadonlyContentElementId, parseCandidates } from "./parse.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import type { DesignSpec } from "../schemas/design-spec.js";
import type { ApprovedCopy } from "../schemas/approved-copy.js";
import type { CanvaToolDescriptor } from "../schemas/canva-session.js";

const now = "2026-09-08T04:00:00.000Z";

const LIVE_TOOLS: CanvaToolDescriptor[] = [
  "generate-design",
  "create-design-from-candidate",
  "start-editing-transaction",
  "perform-editing-operations",
  "commit-editing-transaction",
  "cancel-editing-transaction",
  "export-design",
  "get-design-content",
  "get-design-thumbnail",
  "resize-design",
  "search-brand-templates",
  "create-design-from-brand-template",
  "autofill-design",
  "get-brand-template-dataset",
].map((name) => ({ name, live: true }));

function ok(content: unknown): CanvaMcpCallResult {
  return { content };
}

function createMockClient(options?: {
  tools?: CanvaToolDescriptor[];
  exportSequence?: unknown[];
  rateLimitOnceFor?: string;
}): CanvaMcpClient & { calls: string[] } {
  const calls: string[] = [];
  let rateLimited = false;
  let exportIdx = 0;

  return {
    calls,
    async listTools() {
      return options?.tools ?? LIVE_TOOLS;
    },
    async callTool(toolName, args) {
      calls.push(toolName);

      if (
        options?.rateLimitOnceFor === toolName &&
        !rateLimited
      ) {
        rateLimited = true;
        throw new Error("429 Too Many Requests — retry in 10ms");
      }

      switch (toolName) {
        case "generate-design":
          return ok({
            candidates: [
              {
                candidate_id: "cand-a",
                thumbnail_url: "https://example.com/a.png",
                rationale: "Strong hierarchy for the RSVP CTA",
              },
              {
                candidate_id: "cand-b",
                thumbnail_url: "https://example.com/b.png",
                rationale: "Typographic lead with quiet photo",
              },
            ],
          });
        case "create-design-from-candidate":
          assert.equal(args.candidate_id ?? args.candidateId, "cand-a");
          return ok({
            design_summary: {
              design_id: "DAG123",
              urls: { edit_url: "https://www.canva.com/design/DAG123/edit" },
            },
            pages: [{ page_id: "PAGE1", page_number: 1 }],
          });
        case "start-editing-transaction":
          return ok({
            transaction: { status: "open", transaction_id: "TXN1" },
            edit_design_url: "https://www.canva.com/design/DAG123/edit",
            richtexts: [
              {
                page_index: 1,
                element_id: "EL_TEXT_1",
                regions: [{ type: "character", text: "Open Studio Night" }],
              },
            ],
            fills: [
              {
                type: "image",
                element_id: "EL_FILL_1",
                editable: true,
                page_index: 1,
                asset_id: "ASSET1",
              },
            ],
            pages: [{ page_id: "PAGE1", page_number: 1 }],
          });
        case "perform-editing-operations":
          return ok({
            edit_operation_results: [
              { status: "success", operation_info: { type: "replace_text", element_id: "EL_TEXT_1" } },
            ],
            richtexts: [
              {
                page_index: 1,
                element_id: "EL_TEXT_1",
                regions: [{ type: "character", text: "Open Studio Night" }],
              },
            ],
            fills: [],
            pages: [{ page_id: "PAGE1" }],
            edit_design_url: "https://www.canva.com/design/DAG123/edit",
            transaction: { transaction_id: "TXN1" },
          });
        case "commit-editing-transaction":
          return ok({ status: "committed" });
        case "get-design-content":
          return ok({
            // Read-only payload may include id-like fields that must not be editable
            elements: [{ element_id: "READONLY_FAKE", text: "noise" }],
          });
        case "export-design": {
          const seq = options?.exportSequence;
          if (seq && exportIdx < seq.length) {
            const item = seq[exportIdx]!;
            exportIdx += 1;
            return ok(item);
          }
          return ok({
            job: {
              job_id: "EXP1",
              status: "completed",
              download_url: "https://example.com/export.png",
            },
          });
        }
        default:
          throw new Error(`Unexpected tool ${toolName}`);
      }
    },
  };
}

const approvedCopy: ApprovedCopy = {
  schemaVersion: SCHEMA_VERSION,
  id: "copy-1",
  createdAt: now,
  updatedAt: now,
  headline: "Open Studio Night",
  callToAction: "RSVP today",
  lockedLines: {},
  claims: [],
  approvalRecordId: "apr-copy-1",
  approvalStatus: "approved",
};

const spec: DesignSpec = {
  schemaVersion: SCHEMA_VERSION,
  id: "spec-1",
  createdAt: now,
  updatedAt: now,
  briefId: "brief-1",
  brandId: "brand-1",
  conceptId: "concept-a",
  approvedCopyId: "copy-1",
  formatId: "poster",
  governingIdea: "Open door invites neighbors in",
  hardConstraints: {
    mustIncludeText: ["Open Studio Night"],
    mustExcludeText: [],
    formatId: "poster",
    dimensions: { width: 18, height: 24, unit: "in" },
    localization: { locale: "en-US", language: "en", rtl: false },
    accessibility: {
      minContrastRatio: 4.5,
      altTextRequired: true,
      colorBlindSafe: false,
      notes: [],
    },
    printer: { required: true, bleedInches: 0.125, notes: [] },
    requireApprovalFor: [
      "copy",
      "price",
      "date",
      "testimonial",
      "logo",
      "certification",
      "contact",
      "claim",
    ],
  },
  creativePreferences: {
    moodKeywords: [],
    preferredPaletteHints: [],
    typographyHints: [],
    imageryHints: [],
    doPrefer: [],
    doAvoid: [],
    referenceUrls: [],
    notes: [],
  },
  productionNotes: [],
  allowedClaimIds: [],
  allowedAssetIds: [],
};

describe("Canva discovery + capabilities", () => {
  it("logs empty discovery when no tools are connected", async () => {
    const log = await discoverCanvaTools(null, { now });
    assert.equal(log.tools.length, 0);
    assert.equal(log.source, "empty");
    const caps = validateAccountCapabilities(log, { now });
    assert.equal(caps.generationReady, false);
    assert.ok(caps.blockingIssues.length >= 1);
  });

  it("marks generation/editing/export ready when tools are live", async () => {
    const client = createMockClient();
    const log = await discoverCanvaTools(client, { now });
    assert.ok(log.tools.some((t) => t.name === "generate-design"));
    const caps = validateAccountCapabilities(log, { now });
    assert.equal(caps.generationReady, true);
    assert.equal(caps.editingReady, true);
    assert.equal(caps.exportReady, true);
    assert.equal(caps.resizeReady, true);
    assert.equal(caps.templatesReady, true);
    assert.equal(caps.autofillReady, true);
  });

  it("records plan_restricted for autofill override", async () => {
    const client = createMockClient();
    const log = await discoverCanvaTools(client, { now });
    const caps = validateAccountCapabilities(log, {
      now,
      planOverrides: { autofill: "plan_restricted" },
    });
    assert.equal(caps.autofillReady, false);
    assert.equal(
      caps.probes.find((p) => p.kind === "autofill")?.status,
      "plan_restricted",
    );
  });
});

describe("CanvaAdapter workflow", () => {
  it("runs discover → candidates → explicit select → edit → commit → handoff → export", async () => {
    const client = createMockClient();
    const logs: string[] = [];
    const adapter = new CanvaAdapter({
      client,
      now: () => now,
      log: (line) => logs.push(line),
      retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5 },
    });

    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();

    const presentation = await adapter.generateAndPresentCandidates({
      spec,
      approvedCopy,
      conceptOneLiner: "Open door invites neighbors in",
    });
    assert.equal(presentation.candidates.length, 2);
    assert.equal(presentation.selectedCandidateId, null);
    assert.equal(adapter.getSession()?.phase, "awaiting_candidate_selection");

    assert.throws(
      () => adapter.selectCandidate(""),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "silent_choice_forbidden",
    );

    await assert.rejects(
      () => adapter.createDesignFromSelection(),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "premature_edit",
    );

    adapter.selectCandidate("cand-a");
    const created = await adapter.createDesignFromSelection();
    assert.equal(created.designId, "DAG123");
    assert.match(created.editUrl, /canva\.com/);

    await adapter.loadReadonlyContentForValidation();
    await adapter.openEditingTransaction();

    assert.throws(
      () =>
        assertNotReadonlyContentElementId(
          "READONLY_FAKE",
          new Set(["READONLY_FAKE"]),
        ),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "readonly_element_forbidden",
    );

    await assert.rejects(
      () =>
        adapter.performEdits([
          { type: "replace_text", element_id: "READONLY_FAKE", text: "Nope" },
        ]),
      (err: unknown) =>
        err instanceof CanvaAdapterError &&
        (err.code === "readonly_element_forbidden" ||
          err.code === "invalid_element_id"),
    );

    await adapter.performEdits([
      { type: "replace_text", element_id: "EL_TEXT_1", text: "Open Studio Night" },
    ]);

    await assert.rejects(
      () => adapter.exportDesign({ format: "png", maxPolls: 1, pollIntervalMs: 1 }),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "premature_export",
    );

    const handoff = await adapter.commitAfterValidation(() => true);
    assert.equal(handoff.designId, "DAG123");
    assert.equal(adapter.getSession()?.phase, "handoff_ready");

    const exported = await adapter.exportDesign({
      format: "png",
      maxPolls: 2,
      pollIntervalMs: 1,
    });
    assert.equal(exported.downloadUrl, "https://example.com/export.png");
    assert.ok(client.calls.includes("generate-design"));
    assert.ok(client.calls.includes("commit-editing-transaction"));
    assert.ok(logs.some((l) => l.includes("HANDOFF")));
  });

  it("refuses commit when validation fails", async () => {
    const client = createMockClient();
    const adapter = new CanvaAdapter({
      client,
      now: () => now,
      log: () => undefined,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    adapter.selectCandidate("cand-a");
    await adapter.createDesignFromSelection();
    await adapter.openEditingTransaction();
    await assert.rejects(
      () => adapter.commitAfterValidation(() => false),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "validation_failed",
    );
  });

  it("retries rate-limited tool calls", async () => {
    const client = createMockClient({ rateLimitOnceFor: "generate-design" });
    const adapter = new CanvaAdapter({
      client,
      now: () => now,
      log: () => undefined,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    });
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    const presentation = await adapter.generateAndPresentCandidates({
      spec,
      approvedCopy,
    });
    assert.equal(presentation.candidates.length, 2);
    assert.ok(
      client.calls.filter((c) => c === "generate-design").length >= 2,
    );
  });

  it("polls async export jobs", async () => {
    const client = createMockClient({
      exportSequence: [
        { job: { job_id: "EXP1", status: "pending" } },
        {
          job: {
            job_id: "EXP1",
            status: "completed",
            download_url: "https://example.com/done.png",
          },
        },
      ],
    });
    const adapter = new CanvaAdapter({
      client,
      now: () => now,
      log: () => undefined,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    adapter.selectCandidate("cand-a");
    await adapter.createDesignFromSelection();
    adapter.publishHandoff();
    const exported = await adapter.exportDesign({
      format: "png",
      maxPolls: 5,
      pollIntervalMs: 1,
    });
    assert.equal(exported.downloadUrl, "https://example.com/done.png");
  });
});

describe("parseCandidates", () => {
  it("requires candidate ids and does not invent them", () => {
    assert.throws(() => parseCandidates({ candidates: [{ rationale: "x" }] }));
  });
});
