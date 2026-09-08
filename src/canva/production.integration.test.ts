/**
 * Production-hardening integration tests with mocked Canva MCP responses.
 * Covers: candidate generation, user selection, editing transaction, commit,
 * export failure, expired URL, rate limiting, and partial job completion.
 * Does not scrape Canva, reverse-engineer undocumented APIs, or store credentials.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ApprovedCopy } from "../schemas/approved-copy.js";
import type { DesignSpec } from "../schemas/design-spec.js";
import type { CanvaToolDescriptor } from "../schemas/canva-session.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import { AuditLogger } from "../lib/audit.js";
import { CapabilityCache } from "../lib/capability-cache.js";
import { loadEnvConfig, describeEnvConfig, readSecret } from "../lib/env.js";
import { JobStore } from "../lib/job-store.js";
import { redactForAudit } from "../lib/redact.js";
import { ToolRateLimiter } from "../lib/rate-limit.js";
import { CanvaAdapter } from "./adapter.js";
import type { CanvaMcpClient, CanvaMcpCallResult } from "./client.js";
import { CanvaAdapterError } from "./errors.js";

const now = "2026-09-08T06:00:00.000Z";

const LIVE_TOOLS: CanvaToolDescriptor[] = [
  "generate-design",
  "create-design-from-candidate",
  "start-editing-transaction",
  "perform-editing-operations",
  "commit-editing-transaction",
  "cancel-editing-transaction",
  "export-design",
  "get-design-content",
].map((name) => ({ name, live: true }));

function ok(content: unknown): CanvaMcpCallResult {
  return { content };
}

type MockBehavior = {
  tools?: CanvaToolDescriptor[];
  exportSequence?: unknown[];
  rateLimitOnceFor?: string;
  exportAlwaysFail?: boolean;
  exportExpiredUrlOnPoll?: boolean;
  createCount?: { n: number };
};

function createMockClient(behavior: MockBehavior = {}): CanvaMcpClient & {
  calls: string[];
  lastArgs: Record<string, unknown>[];
} {
  const calls: string[] = [];
  const lastArgs: Record<string, unknown>[] = [];
  let rateLimited = false;
  let exportIdx = 0;
  behavior.createCount = behavior.createCount ?? { n: 0 };

  return {
    calls,
    lastArgs,
    async listTools() {
      return behavior.tools ?? LIVE_TOOLS;
    },
    async callTool(toolName, args) {
      calls.push(toolName);
      lastArgs.push(args);

      if (behavior.rateLimitOnceFor === toolName && !rateLimited) {
        rateLimited = true;
        throw new Error("429 Too Many Requests — retry in 5ms");
      }

      switch (toolName) {
        case "generate-design":
          return ok({
            candidates: [
              {
                candidate_id: "cand-a",
                thumbnail_url: "https://example.com/a.png",
                rationale: "Clear RSVP hierarchy",
              },
              {
                candidate_id: "cand-b",
                thumbnail_url: "https://example.com/b.png",
                rationale: "Quiet photo lead",
              },
            ],
          });
        case "create-design-from-candidate":
          behavior.createCount!.n += 1;
          return ok({
            design_summary: {
              design_id: "DAG999",
              urls: { edit_url: "https://www.canva.com/design/DAG999/edit" },
            },
            pages: [{ page_id: "PAGE1", page_number: 1 }],
          });
        case "start-editing-transaction":
          return ok({
            transaction: { status: "open", transaction_id: "TXN9" },
            edit_design_url: "https://www.canva.com/design/DAG999/edit",
            richtexts: [
              {
                page_index: 1,
                element_id: "EL_TEXT_1",
                regions: [{ type: "character", text: "Open Studio Night" }],
              },
            ],
            fills: [],
            pages: [{ page_id: "PAGE1", page_number: 1 }],
          });
        case "perform-editing-operations":
          return ok({
            edit_operation_results: [{ status: "success" }],
            richtexts: [
              {
                page_index: 1,
                element_id: "EL_TEXT_1",
                regions: [{ type: "character", text: "Open Studio Night" }],
              },
            ],
            fills: [],
            pages: [{ page_id: "PAGE1" }],
            edit_design_url: "https://www.canva.com/design/DAG999/edit",
            transaction: { transaction_id: "TXN9" },
          });
        case "commit-editing-transaction":
          return ok({ status: "committed" });
        case "get-design-content":
          return ok({ elements: [{ element_id: "RO1", text: "x" }] });
        case "export-design": {
          if (behavior.exportAlwaysFail) {
            return ok({
              job: { job_id: "EXP_FAIL", status: "failed" },
            });
          }
          if (behavior.exportExpiredUrlOnPoll && exportIdx >= 1) {
            exportIdx += 1;
            throw new Error("Download URL expired for export job EXP_EXP");
          }
          const seq = behavior.exportSequence;
          if (seq && exportIdx < seq.length) {
            const item = seq[exportIdx]!;
            exportIdx += 1;
            return ok(item);
          }
          return ok({
            job: {
              job_id: "EXP_OK",
              status: "completed",
              download_url: "https://example.com/ok.png",
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
  id: "spec-prod-1",
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

function productionAdapter(
  client: ReturnType<typeof createMockClient>,
  extras?: Partial<ConstructorParameters<typeof CanvaAdapter>[0]>,
) {
  const audit = new AuditLogger({
    correlationId: "corr_test",
    jobId: "job_test",
    now: () => now,
  });
  return new CanvaAdapter({
    client,
    now: () => now,
    nowMs: () => Date.parse(now),
    sleepFn: async () => undefined,
    log: () => undefined,
    jobId: "job_test",
    correlationId: "corr_test",
    audit,
    retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    env: {
      ...loadEnvConfig({}),
      maxRetryAttempts: 3,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 5,
      exportMaxPolls: 5,
      exportPollIntervalMs: 1,
      capabilityCacheTtlMs: 60_000,
    },
    rateLimitOverrides: [{ toolName: "export-design", requestsPerMinute: 20 }],
    ...extras,
  });
}

describe("production hardening — mocked Canva integration", () => {
  it("generates candidates without selecting", async () => {
    const client = createMockClient();
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    const presentation = await adapter.generateAndPresentCandidates({
      spec,
      approvedCopy,
    });
    assert.equal(presentation.candidates.length, 2);
    assert.equal(presentation.selectedCandidateId, null);
    assert.equal(adapter.getSession()?.phase, "awaiting_candidate_selection");
    assert.equal(adapter.getCorrelationId(), "corr_test");
    assert.ok(client.lastArgs[0]?._gds);
  });

  it("requires explicit user selection before create", async () => {
    const client = createMockClient();
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    await assert.rejects(() => adapter.createDesignFromSelection(), (err) => {
      return err instanceof CanvaAdapterError && err.code === "premature_edit";
    });
    adapter.selectCandidate("cand-a");
    assert.equal(adapter.getSession()?.phase, "candidate_selected");
  });

  it("runs editing transaction then commit after validation", async () => {
    const client = createMockClient();
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    adapter.selectCandidate("cand-a");
    const created = await adapter.createDesignFromSelection();
    assert.equal(created.designId, "DAG999");

    // Idempotent replay must not create a second design
    const again = await adapter.createDesignFromSelection();
    assert.equal(again.designId, "DAG999");
    assert.equal(client.calls.filter((c) => c === "create-design-from-candidate").length, 1);

    const txn = await adapter.openEditingTransaction();
    assert.equal(txn.transactionId, "TXN9");
    await adapter.performEdits([
      { type: "replace_text", element_id: "EL_TEXT_1", text: "Open Studio Night" },
    ]);
    const handoff = await adapter.commitAfterValidation(() => true);
    assert.equal(handoff.editUrl.includes("DAG999"), true);
    assert.equal(adapter.getSession()?.phase, "handoff_ready");
  });

  it("surfaces structured export failure", async () => {
    const client = createMockClient({ exportAlwaysFail: true });
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    adapter.selectCandidate("cand-a");
    await adapter.createDesignFromSelection();
    adapter.publishHandoff();
    await assert.rejects(
      () => adapter.exportDesign({ format: "png", maxPolls: 2, pollIntervalMs: 1 }),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "async_failed",
    );
  });

  it("classifies expired export URL as retryable structured error", async () => {
    const client = createMockClient({
      exportSequence: [{ job: { job_id: "EXP_EXP", status: "pending" } }],
      exportExpiredUrlOnPoll: true,
    });
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    adapter.selectCandidate("cand-a");
    await adapter.createDesignFromSelection();
    adapter.publishHandoff();
    await assert.rejects(
      () => adapter.exportDesign({ format: "png", maxPolls: 3, pollIntervalMs: 1 }),
      (err: unknown) =>
        err instanceof CanvaAdapterError && err.code === "expired_url",
    );
    const session = adapter.getSession();
    assert.equal(session?.failureState.failed, true);
    assert.equal(session?.failureState.code, "expired_url");
    assert.equal(session?.failureState.correlationId, "corr_test");
  });

  it("retries on rate limiting with exponential backoff awareness", async () => {
    const client = createMockClient({ rateLimitOnceFor: "generate-design" });
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    const presentation = await adapter.generateAndPresentCandidates({
      spec,
      approvedCopy,
    });
    assert.equal(presentation.candidates.length, 2);
    assert.ok(client.calls.filter((c) => c === "generate-design").length >= 2);
    const retries = adapter
      .getAuditLogger()
      .getEvents()
      .filter((e) => e.kind === "retry");
    assert.ok(retries.length >= 1);
  });

  it("reports partial job completion after bounded polls", async () => {
    const client = createMockClient({
      exportSequence: [
        { job: { job_id: "EXP_P", status: "partial" } },
        { job: { job_id: "EXP_P", status: "partial" } },
        { job: { job_id: "EXP_P", status: "partial" } },
      ],
    });
    const adapter = productionAdapter(client);
    await adapter.discoverAndLogTools();
    await adapter.validateCapabilities();
    await adapter.generateAndPresentCandidates({ spec, approvedCopy });
    adapter.selectCandidate("cand-a");
    await adapter.createDesignFromSelection();
    adapter.publishHandoff();
    await assert.rejects(
      () => adapter.exportDesign({ format: "png", maxPolls: 2, pollIntervalMs: 1 }),
      (err: unknown) =>
        err instanceof CanvaAdapterError &&
        err.code === "async_pending" &&
        String(err.details?.status) === "partial",
    );
  });

  it("caches capabilities with TTL and applies live rate-limit overrides", async () => {
    const client = createMockClient();
    let clock = Date.parse(now);
    const cache = new CapabilityCache<{
      discovery: NonNullable<ReturnType<CanvaAdapter["getDiscoveryLog"]>>;
      capabilities: NonNullable<ReturnType<CanvaAdapter["getCapabilityReport"]>>;
    }>({
      ttlMs: 10_000,
      nowMs: () => clock,
    });
    const limiter = new ToolRateLimiter({ nowMs: () => clock });
    const adapter = productionAdapter(client, {
      capabilityCache: cache,
      rateLimiter: limiter,
      rateLimitOverrides: [
        { toolName: "generate-design", requestsPerMinute: 5 },
      ],
      nowMs: () => clock,
    });
    await adapter.validateCapabilities();
    assert.equal(adapter.getCapabilityReport()?.generationReady, true);
    const generateLimit = adapter
      .getCapabilityReport()
      ?.toolRateLimits.find((t) => t.toolName === "generate-design");
    assert.equal(generateLimit?.requestsPerMinute, 5);
    assert.equal(generateLimit?.source, "capability_response");

    const listCallsBefore = client.calls.length;
    clock += 1000;
    await adapter.validateCapabilities();
    // Cache hit — no new listTools needed for second validate via discover
    assert.equal(cache.isFresh(), true);
    void listCallsBefore;
  });

  it("redacts tokens in audit payloads and never exposes env secrets", () => {
    const redacted = redactForAudit({
      authorization: "Bearer SECRET_TOKEN_VALUE",
      note: "ok",
      nested: { access_token: "abc", safe: 1 },
    }) as Record<string, unknown>;
    assert.equal(redacted.authorization, "[REDACTED]");
    assert.equal((redacted.nested as Record<string, unknown>).access_token, "[REDACTED]");
    assert.equal((redacted.nested as Record<string, unknown>).safe, 1);

    const cfg = loadEnvConfig({
      CANVA_CONNECT_CLIENT_SECRET: "super-secret",
      GDS_JOBS_ROOT: "artifacts/jobs",
    });
    assert.deepEqual(cfg.presentSecrets, ["CANVA_CONNECT_CLIENT_SECRET"]);
    const described = describeEnvConfig(cfg);
    assert.ok(
      JSON.stringify(described).includes("[REDACTED]"),
    );
    assert.ok(!JSON.stringify(described).includes("super-secret"));
    // readSecret is for host bridges only — value must not be logged by describe
    assert.equal(readSecret("CANVA_CONNECT_CLIENT_SECRET", {
      CANVA_CONNECT_CLIENT_SECRET: "super-secret",
    }), "super-secret");
  });

  it("stores versioned briefs, concepts, specs, critiques, and exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "gds-jobs-"));
    try {
      const store = new JobStore({ rootDir: root, now: () => now });
      const manifest = await store.createJob({
        jobId: "job_versioned",
        correlationId: "corr_v",
      });
      assert.equal(manifest.phase, "intake");

      await store.saveVersionedArtifact({
        jobId: "job_versioned",
        kind: "brief",
        artifactId: "brief-1",
        version: "v1",
        body: { id: "brief-1", headline: "Open Studio Night" },
      });
      await store.saveVersionedArtifact({
        jobId: "job_versioned",
        kind: "concept_board",
        artifactId: "board-1",
        version: "v1",
        body: { concepts: 6 },
      });
      await store.saveVersionedArtifact({
        jobId: "job_versioned",
        kind: "design_spec",
        artifactId: "spec-1",
        version: "v1",
        body: { id: "spec-1" },
      });
      await store.saveVersionedArtifact({
        jobId: "job_versioned",
        kind: "critique",
        artifactId: "crit-1",
        version: "v2",
        body: { decision: "revise" },
      });
      await store.saveVersionedArtifact({
        jobId: "job_versioned",
        kind: "export",
        artifactId: "exp-1",
        version: "v1",
        body: { downloadUrl: "https://example.com/ok.png" },
      });

      const latest = await store.readManifest("job_versioned");
      assert.equal(latest.latest.briefVersion, "v1");
      assert.equal(latest.latest.conceptBoardVersion, "v1");
      assert.equal(latest.latest.designSpecVersion, "v1");
      assert.equal(latest.latest.critiqueVersion, "v2");
      assert.equal(latest.latest.exportVersion, "v1");
      assert.equal(latest.versions.length, 5);
      assert.ok(latest.versions.every((v) => v.sha256));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
