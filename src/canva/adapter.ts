import type { ApprovedCopy } from "../schemas/approved-copy.js";
import type { DesignSpec } from "../schemas/design-spec.js";
import type {
  CanvaAccountCapabilityReport,
  CanvaAdapterSession,
  CanvaToolDiscoveryLog,
  CandidatePresentation,
  DesignCandidate,
  EditableElementRef,
  EditingTransactionState,
} from "../schemas/canva-session.js";
import {
  CanvaAdapterSessionSchema,
  CandidatePresentationSchema,
} from "../schemas/canva-session.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import { AuditLogger } from "../lib/audit.js";
import { CapabilityCache } from "../lib/capability-cache.js";
import { loadEnvConfig, type EnvConfig } from "../lib/env.js";
import {
  assertPhaseTransition,
  IdempotencyStore,
  IllegalPhaseTransitionError,
} from "../lib/idempotency.js";
import {
  createCorrelationId,
  createJobId,
  createRequestId,
} from "../lib/ids.js";
import { pollAsyncJob } from "../lib/poll.js";
import { ToolRateLimiter } from "../lib/rate-limit.js";
import { redactForAudit } from "../lib/redact.js";
import { withBoundedRetry } from "../lib/retry.js";
import {
  type CanvaMcpClient,
  type RetryPolicy,
  sleep,
} from "./client.js";
import { validateAccountCapabilities } from "./capabilities.js";
import { discoverCanvaTools, formatDiscoveryLog } from "./discovery.js";
import {
  CanvaAdapterError,
  classifyMcpFailure,
} from "./errors.js";
import {
  parseCandidates,
  parseCreatedDesign,
  parseEditingTransaction,
  parseExportJob,
  unwrapMcpContent,
  assertNotReadonlyContentElementId,
} from "./parse.js";
import { buildGenerationPromptFromSpec } from "./prompt.js";
import { resolveLiveToolName } from "./tool-catalog.js";

export type EditOperation =
  | {
      type: "replace_text" | "find_and_replace_text";
      element_id: string;
      text: string;
      page_index?: number;
    }
  | {
      type: "replace_fill";
      element_id: string;
      asset_id: string;
      page_index?: number;
    }
  | {
      type: string;
      element_id: string;
      [key: string]: unknown;
    };

export type CanvaAdapterOptions = {
  client: CanvaMcpClient;
  retry?: RetryPolicy;
  now?: () => string;
  nowMs?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
  /** Injected discovery list (e.g. Cursor runtime catalog). */
  injectedTools?: Parameters<typeof discoverCanvaTools>[1] extends infer O
    ? O extends { injectedTools?: infer T }
      ? T
      : never
    : never;
  log?: (line: string) => void;
  jobId?: string;
  correlationId?: string;
  env?: EnvConfig;
  audit?: AuditLogger;
  rateLimiter?: ToolRateLimiter;
  capabilityCache?: CapabilityCache<{
    discovery: CanvaToolDiscoveryLog;
    capabilities: CanvaAccountCapabilityReport;
  }>;
  /** Live capability response rate-limit overrides (documented fields only). */
  rateLimitOverrides?: Array<{ toolName: string; requestsPerMinute: number }>;
};

function appendLog(session: CanvaAdapterSession, line: string): CanvaAdapterSession {
  return { ...session, log: [...session.log, line], updatedAt: session.updatedAt };
}

/**
 * Official Canva Design MCP adapter.
 * Never silently selects candidates, never flattens designs, never uses
 * read-only content element ids for edits, and never exports before handoff.
 * Production hardening: bounded retries, rate limits, idempotent transitions,
 * correlation IDs, capability TTL cache, redacted audit events.
 */
export class CanvaAdapter {
  private readonly client: CanvaMcpClient;
  private readonly retry: RetryPolicy;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly injectedTools: CanvaAdapterOptions["injectedTools"];
  private readonly emit: (line: string) => void;
  private readonly env: EnvConfig;
  private readonly jobId: string;
  private readonly correlationId: string;
  private readonly audit: AuditLogger;
  private readonly rateLimiter: ToolRateLimiter;
  private readonly capabilityCache: CapabilityCache<{
    discovery: CanvaToolDiscoveryLog;
    capabilities: CanvaAccountCapabilityReport;
  }>;
  private readonly idempotency = new IdempotencyStore();
  private readonly rateLimitOverrides: CanvaAdapterOptions["rateLimitOverrides"];

  private discovery: CanvaToolDiscoveryLog | null = null;
  private capabilities: CanvaAccountCapabilityReport | null = null;
  private session: CanvaAdapterSession | null = null;
  private presentation: CandidatePresentation | null = null;
  /** Element ids observed only via editing transaction tools. */
  private transactionElementIds = new Set<string>();
  /** Element-like ids from get-design-content — forbidden for edits. */
  private readonlyContentElementIds = new Set<string>();

  constructor(options: CanvaAdapterOptions) {
    this.client = options.client;
    this.env = options.env ?? loadEnvConfig();
    this.retry =
      options.retry ??
      ({
        maxAttempts: this.env.maxRetryAttempts,
        baseDelayMs: this.env.retryBaseDelayMs,
        maxDelayMs: this.env.retryMaxDelayMs,
      } satisfies RetryPolicy);
    this.now = options.now ?? (() => new Date().toISOString());
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.sleepFn = options.sleepFn ?? sleep;
    this.injectedTools = options.injectedTools;
    this.emit = options.log ?? ((line) => console.info(line));
    this.jobId = options.jobId ?? createJobId();
    this.correlationId = options.correlationId ?? createCorrelationId();
    this.audit =
      options.audit ??
      new AuditLogger({
        correlationId: this.correlationId,
        jobId: this.jobId,
        now: this.now,
        filePath: this.env.auditLogPath,
      });
    this.rateLimiter =
      options.rateLimiter ?? new ToolRateLimiter({ nowMs: this.nowMs });
    this.capabilityCache =
      options.capabilityCache ??
      new CapabilityCache({
        ttlMs: this.env.capabilityCacheTtlMs,
        nowMs: this.nowMs,
      });
    this.rateLimitOverrides = options.rateLimitOverrides;
  }

  getJobId(): string {
    return this.jobId;
  }

  getCorrelationId(): string {
    return this.correlationId;
  }

  getAuditLogger(): AuditLogger {
    return this.audit;
  }

  getSession(): CanvaAdapterSession | null {
    return this.session;
  }

  getDiscoveryLog(): CanvaToolDiscoveryLog | null {
    return this.discovery;
  }

  getCapabilityReport(): CanvaAccountCapabilityReport | null {
    return this.capabilities;
  }

  getCandidatePresentation(): CandidatePresentation | null {
    return this.presentation;
  }

  /** 1. Discover and log currently available Canva tools (capability-cache aware). */
  async discoverAndLogTools(options?: {
    forceRefresh?: boolean;
  }): Promise<CanvaToolDiscoveryLog> {
    const cached = this.capabilityCache.get();
    if (!options?.forceRefresh && cached) {
      this.discovery = cached.discovery;
      this.capabilities = cached.capabilities;
      await this.audit.emit({
        kind: "capability_cache_hit",
        message: "Using cached Canva discovery/capabilities",
        payload: { cache: this.capabilityCache.meta() },
      });
      this.emit(formatDiscoveryLog(this.discovery));
      return this.discovery;
    }

    await this.audit.emit({
      kind: "capability_cache_miss",
      message: "Discovering Canva tools",
    });

    const opts: Parameters<typeof discoverCanvaTools>[1] = { now: this.now() };
    if (this.injectedTools) opts.injectedTools = this.injectedTools;
    this.discovery = await discoverCanvaTools(this.client, opts);
    this.emit(formatDiscoveryLog(this.discovery));
    return this.discovery;
  }

  /** 2. Validate account capabilities for core + plan-gated features. */
  async validateCapabilities(
    planOverrides?: NonNullable<
      Parameters<typeof validateAccountCapabilities>[1]
    >["planOverrides"],
    options?: { forceRefresh?: boolean },
  ): Promise<CanvaAccountCapabilityReport> {
    const cached = this.capabilityCache.get();
    if (!options?.forceRefresh && cached) {
      this.discovery = cached.discovery;
      this.capabilities = cached.capabilities;
      this.rateLimiter.applyOverrides(
        cached.capabilities.toolRateLimits.map((t) => ({
          toolName: t.toolName,
          requestsPerMinute: t.requestsPerMinute,
        })),
        "capability_response",
      );
      return this.capabilities;
    }

    if (!this.discovery || options?.forceRefresh) {
      if (options?.forceRefresh) {
        await this.discoverAndLogTools({ forceRefresh: true });
      } else {
        await this.discoverAndLogTools();
      }
    }

    const expiresAtMs =
      this.nowMs() + this.env.capabilityCacheTtlMs;
    const capsOpts: Parameters<typeof validateAccountCapabilities>[1] = {
      now: this.now(),
      exportPoll: {
        maxPolls: this.env.exportMaxPolls,
        pollIntervalMs: this.env.exportPollIntervalMs,
      },
      cacheExpiresAt: new Date(expiresAtMs).toISOString(),
    };
    if (planOverrides) capsOpts.planOverrides = planOverrides;
    if (this.rateLimitOverrides) {
      capsOpts.rateLimitOverrides = this.rateLimitOverrides;
    }

    this.capabilities = validateAccountCapabilities(this.discovery!, capsOpts);
    this.rateLimiter.applyOverrides(
      this.capabilities.toolRateLimits.map((t) => ({
        toolName: t.toolName,
        requestsPerMinute: t.requestsPerMinute,
      })),
      "capability_response",
    );

    this.capabilityCache.set({
      discovery: this.discovery!,
      capabilities: this.capabilities,
    });

    for (const issue of this.capabilities.blockingIssues) {
      this.emit(`[Canva capabilities] BLOCKING: ${issue}`);
    }
    for (const probe of this.capabilities.probes) {
      this.emit(
        `[Canva capabilities] ${probe.kind}=${probe.status}` +
          (probe.detail ? ` (${probe.detail})` : ""),
      );
    }
    await this.audit.emit({
      kind: "capability_probe",
      message: "Validated Canva account capabilities",
      payload: {
        generationReady: this.capabilities.generationReady,
        editingReady: this.capabilities.editingReady,
        exportReady: this.capabilities.exportReady,
        toolRateLimitCount: this.capabilities.toolRateLimits.length,
        cacheExpiresAt: this.capabilities.cacheExpiresAt,
      },
    });
    return this.capabilities;
  }

  private requireTool(documentedName: string): string {
    const live = this.discovery?.tools ?? [];
    const name = resolveLiveToolName(live, documentedName);
    if (!name) {
      throw new CanvaAdapterError(
        "tool_missing",
        `Required Canva tool not discovered in this session: ${documentedName}`,
        { retryable: false },
      );
    }
    return name;
  }

  private async callWithRetry(
    documentedName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const liveName = this.requireTool(documentedName);
    const requestId = createRequestId();
    if (this.session) {
      this.session = {
        ...this.session,
        lastRequestId: requestId,
        updatedAt: this.now(),
      };
    }

    const wait = await this.rateLimiter.acquire(liveName, this.sleepFn);
    if (wait) {
      await this.audit.emit({
        kind: "rate_limit_wait",
        message: `Rate-limit wait for ${liveName}`,
        requestId,
        toolName: liveName,
        payload: {
          waitMs: wait.waitMs,
          requestsPerMinute: wait.requestsPerMinute,
        },
      });
      this.emit(
        `[Canva] rate-limit wait ${wait.waitMs}ms for ${liveName} (${wait.requestsPerMinute}/min)`,
      );
    }

    const correlatedArgs = {
      ...args,
      // Correlation metadata for hosts that forward it; never secrets.
      _gds: {
        correlationId: this.correlationId,
        requestId,
        jobId: this.jobId,
      },
    };

    await this.audit.emit({
      kind: "mcp_request",
      message: `MCP call ${liveName}`,
      requestId,
      toolName: liveName,
      ...(this.session?.phase ? { phase: this.session.phase } : {}),
      payload: {
        argKeys: Object.keys(args),
        args: redactForAudit(args),
      },
    });

    try {
      const content = await withBoundedRetry(
        async () => {
          const result = await this.client.callTool(liveName, correlatedArgs);
          if (result.isError) {
            throw new CanvaAdapterError(
              "upstream",
              `Tool ${liveName} returned isError`,
              {
                retryable: true,
                details: redactForAudit({ content: result.content }) as Record<
                  string,
                  unknown
                >,
              },
            );
          }
          return unwrapMcpContent(result);
        },
        {
          policy: this.retry,
          sleepFn: this.sleepFn,
          shouldRetry: (err) => {
            const classified = classifyMcpFailure(err);
            if (classified.retryAfterMs != null) {
              return {
                retryable: classified.retryable,
                retryAfterMs: classified.retryAfterMs,
              };
            }
            return { retryable: classified.retryable };
          },
          onRetry: async ({ attempt, delayMs, err }) => {
            const classified = classifyMcpFailure(err);
            this.emit(
              `[Canva] retry ${attempt}/${this.retry.maxAttempts} for ${liveName} after ${delayMs}ms (${classified.code})`,
            );
            await this.audit.emit({
              kind: "retry",
              message: `Retrying ${liveName}`,
              requestId,
              toolName: liveName,
              outcome: "pending",
              payload: {
                attempt,
                delayMs,
                code: classified.code,
              },
            });
          },
        },
      );

      if (this.session) {
        this.session = {
          ...this.session,
          toolsUsed: [...new Set([...this.session.toolsUsed, liveName])],
          updatedAt: this.now(),
        };
      }

      await this.audit.emit({
        kind: "mcp_response",
        message: `MCP ok ${liveName}`,
        requestId,
        toolName: liveName,
        ...(this.session?.phase ? { phase: this.session.phase } : {}),
      });
      return content;
    } catch (err) {
      const classified = classifyMcpFailure(err);
      await this.audit.emit({
        kind: "mcp_error",
        message: classified.message,
        requestId,
        toolName: liveName,
        outcome: "error",
        payload: {
          code: classified.code,
          retryable: classified.retryable,
        },
      });
      this.recordStructuredFailure(classified, requestId);
      throw classified;
    }
  }

  private recordStructuredFailure(
    err: CanvaAdapterError,
    requestId: string,
  ): void {
    if (!this.session) return;
    const failureState: CanvaAdapterSession["failureState"] = {
      failed: true,
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      occurredAt: this.now(),
      correlationId: this.correlationId,
      requestId,
      jobId: this.jobId,
    };
    if (err.details) {
      failureState.details = redactForAudit(err.details) as Record<
        string,
        unknown
      >;
    }
    if (err.retryAfterMs != null) failureState.retryAfterMs = err.retryAfterMs;
    this.session = {
      ...this.session,
      phase: "failed",
      failureState,
      updatedAt: this.now(),
    };
  }

  private initSession(designSpecId: string): void {
    const now = this.now();
    this.session = CanvaAdapterSessionSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: `canva-session-${designSpecId}-${now}`,
      createdAt: now,
      updatedAt: now,
      designSpecId,
      jobId: this.jobId,
      correlationId: this.correlationId,
      lastRequestId: null,
      phase: "init",
      discoveryLogId: this.discovery?.id ?? null,
      capabilityReportId: this.capabilities?.id ?? null,
      presentationId: null,
      selectedCandidateId: null,
      designId: null,
      editUrl: null,
      transaction: null,
      exportJobId: null,
      exportFormat: null,
      toolsUsed: [],
      idempotencyKeys: [],
      failureState: { failed: false },
      log: [],
    });
  }

  private setPhase(phase: CanvaAdapterSession["phase"], line?: string): void {
    if (!this.session) throw new CanvaAdapterError("unknown", "No active session");
    try {
      assertPhaseTransition(this.session.phase, phase);
    } catch (err) {
      if (err instanceof IllegalPhaseTransitionError) {
        throw new CanvaAdapterError(
          "validation_failed",
          err.message,
          { retryable: false, details: { from: err.from, to: err.to } },
        );
      }
      throw err;
    }
    const from = this.session.phase;
    this.session = {
      ...this.session,
      phase,
      updatedAt: this.now(),
    };
    void this.audit.emit({
      kind: "phase_transition",
      message: `Phase ${from} → ${phase}`,
      phase,
      payload: { from, to: phase },
    });
    if (line) {
      this.session = appendLog(this.session, line);
      this.emit(line);
    }
  }

  /**
   * 3–4. Generate candidates from approved DesignSpec and present them.
   * Does NOT select a candidate.
   */
  async generateAndPresentCandidates(input: {
    spec: DesignSpec;
    approvedCopy: ApprovedCopy;
    conceptOneLiner?: string;
  }): Promise<CandidatePresentation> {
    if (!this.capabilities) {
      await this.validateCapabilities();
    }
    if (!this.capabilities!.generationReady) {
      throw new CanvaAdapterError(
        "capability_blocked",
        this.capabilities!.blockingIssues.join("; ") ||
          "Generation capability not available",
        { retryable: false },
      );
    }

    this.initSession(input.spec.id);
    this.setPhase(
      "discovered",
      `[Canva] session start for DesignSpec ${input.spec.id}`,
    );
    this.setPhase("capabilities_validated");

    const prompt = buildGenerationPromptFromSpec(
      input.spec,
      input.approvedCopy,
      input.conceptOneLiner
        ? { conceptOneLiner: input.conceptOneLiner }
        : undefined,
    );

    const payload = await this.callWithRetry("generate-design", {
      query: prompt,
      prompt,
    });

    const candidates = parseCandidates(payload).map((c) => this.refreshThumbnail(c));
    const viable = candidates.filter((c) => c.viable);
    if (viable.length === 0) {
      throw new CanvaAdapterError(
        "upstream",
        "No viable candidates returned — nothing to present for selection",
        { retryable: true },
      );
    }

    const now = this.now();
    this.presentation = CandidatePresentationSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: `candidates-${input.spec.id}-${now}`,
      createdAt: now,
      updatedAt: now,
      designSpecId: input.spec.id,
      candidates,
      selectionRequired: true,
      selectedCandidateId: null,
    });

    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      presentationId: this.presentation.id,
      phase: "awaiting_candidate_selection",
      updatedAt: now,
      log: [
        ...this.session!.log,
        `[Canva] presented ${candidates.length} candidate(s); explicit selection required`,
      ],
    });

    this.emit(this.formatCandidatePresentation(this.presentation));
    return this.presentation;
  }

  private refreshThumbnail(candidate: DesignCandidate): DesignCandidate {
    // Expired thumbnail URLs are handled at selection/export time via retry.
    return candidate;
  }

  formatCandidatePresentation(presentation: CandidatePresentation): string {
    const lines = [
      `[Canva candidates] ${presentation.id}`,
      presentation.selectionPrompt,
      ...presentation.candidates.map((c, i) => {
        const thumb = c.thumbnailUrl ? ` thumb=${c.thumbnailUrl}` : " thumb=(none)";
        const viability = c.viable ? "viable" : `non-viable: ${c.nonViableReason}`;
        return `  ${i + 1}. ${c.candidateId} [${viability}]${thumb}\n     rationale: ${c.rationale}`;
      }),
    ];
    return lines.join("\n");
  }

  /**
   * 5. Require explicit user selection before creating/editing a design.
   * Silent auto-choice is forbidden.
   */
  selectCandidate(candidateId: string): CandidatePresentation {
    if (!this.presentation || !this.session) {
      throw new CanvaAdapterError(
        "premature_selection",
        "No candidate presentation is active",
        { retryable: false },
      );
    }
    if (this.session.phase !== "awaiting_candidate_selection") {
      throw new CanvaAdapterError(
        "premature_selection",
        `Cannot select candidate in phase ${this.session.phase}`,
        { retryable: false },
      );
    }
    if (!candidateId?.trim()) {
      throw new CanvaAdapterError(
        "silent_choice_forbidden",
        "Explicit candidateId is required — adapter will not choose silently",
        { retryable: false },
      );
    }

    const match = this.presentation.candidates.find(
      (c) => c.candidateId === candidateId && c.viable,
    );
    if (!match) {
      throw new CanvaAdapterError(
        "premature_selection",
        `Candidate ${candidateId} is not a viable option on the current board`,
        { retryable: false },
      );
    }

    this.presentation = {
      ...this.presentation,
      selectedCandidateId: candidateId,
      updatedAt: this.now(),
    };
    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      selectedCandidateId: candidateId,
      phase: "candidate_selected",
      updatedAt: this.now(),
      log: [
        ...this.session.log,
        `[Canva] user selected candidate ${candidateId}`,
      ],
    });
    this.emit(`[Canva] candidate selected: ${candidateId}`);
    return this.presentation;
  }

  /** Create editable design from the explicitly selected candidate. */
  async createDesignFromSelection(options?: {
    idempotencyKey?: string;
  }): Promise<{
    designId: string;
    editUrl: string;
    pageIds: string[];
  }> {
    if (!this.session?.selectedCandidateId) {
      throw new CanvaAdapterError(
        "premature_edit",
        "Select a candidate explicitly before create-design-from-candidate",
        { retryable: false },
      );
    }

    const idemKey =
      options?.idempotencyKey ??
      `create:${this.session.selectedCandidateId}:${this.session.designSpecId}`;
    const cached = this.idempotency.get<{
      designId: string;
      editUrl: string;
      pageIds: string[];
    }>(idemKey, "create_design");
    if (cached) {
      await this.audit.emit({
        kind: "idempotent_replay",
        message: "Replaying create-design-from-candidate result",
        payload: { idempotencyKey: idemKey },
      });
      return cached;
    }

    const payload = await this.callWithRetry("create-design-from-candidate", {
      candidate_id: this.session.selectedCandidateId,
      candidateId: this.session.selectedCandidateId,
    });
    const created = parseCreatedDesign(payload);

    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      designId: created.designId,
      editUrl: created.editUrl,
      phase: "design_created",
      idempotencyKeys: [...new Set([...this.session.idempotencyKeys, idemKey])],
      updatedAt: this.now(),
      log: [
        ...this.session.log,
        `[Canva] design created id=${created.designId} editUrl=${created.editUrl}`,
      ],
    });
    this.emit(
      `[Canva] design ID ${created.designId}\n[Canva] edit URL ${created.editUrl}`,
    );

    return this.idempotency.remember(idemKey, "create_design", created, this.now());
  }

  /**
   * Publish handoff (design ID + edit URL) before export is offered.
   * Call after create (no-edit path) or after commit.
   */
  publishHandoff(): { designId: string; editUrl: string } {
    if (!this.session?.designId || !this.session.editUrl) {
      throw new CanvaAdapterError(
        "premature_export",
        "Cannot publish handoff without designId and editUrl",
        { retryable: false },
      );
    }
    if (
      this.session.phase !== "design_created" &&
      this.session.phase !== "committed" &&
      this.session.phase !== "handoff_ready"
    ) {
      throw new CanvaAdapterError(
        "premature_export",
        `Handoff not available in phase ${this.session.phase}`,
        { retryable: false },
      );
    }
    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      phase: "handoff_ready",
      updatedAt: this.now(),
      log: [
        ...this.session.log,
        `[Canva] HANDOFF published designId=${this.session.designId} editUrl=${this.session.editUrl}`,
      ],
    });
    this.emit(
      `[Canva] HANDOFF\n  designId: ${this.session.designId}\n  editUrl: ${this.session.editUrl}\nExport may be offered only after this handoff.`,
    );
    return {
      designId: this.session.designId as string,
      editUrl: this.session.editUrl as string,
    };
  }

  /**
   * 6–7. Open editing transaction and index element IDs from the transaction only.
   */
  async openEditingTransaction(): Promise<EditingTransactionState> {
    if (!this.session?.designId || !this.session.editUrl) {
      throw new CanvaAdapterError(
        "premature_edit",
        "designId and editUrl required before editing — create from selected candidate first",
        { retryable: false },
      );
    }
    if (!this.capabilities?.editingReady) {
      throw new CanvaAdapterError(
        "capability_blocked",
        "Editing capability not available on this account/session",
        { retryable: false },
      );
    }

    const payload = await this.callWithRetry("start-editing-transaction", {
      design_id: this.session.designId,
      designId: this.session.designId,
    });
    const parsed = parseEditingTransaction(payload);

    this.transactionElementIds = new Set(
      parsed.elements.filter((e) => e.editable).map((e) => e.elementId),
    );

    const transaction: EditingTransactionState = {
      transactionId: parsed.transactionId,
      designId: this.session.designId,
      editDesignUrl: parsed.editDesignUrl,
      status: "open",
      editableElements: parsed.elements,
      pageIds: parsed.pageIds,
      openedAt: this.now(),
    };

    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      editUrl: parsed.editDesignUrl,
      transaction,
      phase: "editing_open",
      updatedAt: this.now(),
      log: [
        ...this.session.log,
        `[Canva] editing transaction ${parsed.transactionId} with ${parsed.elements.length} editable element(s)`,
      ],
    });

    return transaction;
  }

  /**
   * Optionally load read-only content for validation — never for edit targeting.
   */
  async loadReadonlyContentForValidation(): Promise<unknown> {
    if (!this.session?.designId) {
      throw new CanvaAdapterError("premature_edit", "No designId", {
        retryable: false,
      });
    }
    const payload = await this.callWithRetry("get-design-content", {
      design_id: this.session.designId,
      designId: this.session.designId,
    });
    // Collect any id-like fields so we can reject misuse later
    const blob = JSON.stringify(payload);
    const idMatches = blob.matchAll(/"(?:element_id|elementId)"\s*:\s*"([^"]+)"/g);
    for (const m of idMatches) {
      if (m[1]) this.readonlyContentElementIds.add(m[1]);
    }
    this.emit(
      `[Canva] loaded read-only content for validation (${this.readonlyContentElementIds.size} id-like field(s) quarantined)`,
    );
    return payload;
  }

  private assertEditableElement(elementId: string): void {
    assertNotReadonlyContentElementId(elementId, this.readonlyContentElementIds);
    if (!this.transactionElementIds.has(elementId)) {
      throw new CanvaAdapterError(
        "invalid_element_id",
        `Element ${elementId} is not in the open transaction’s editable element set. Only use IDs from start-editing-transaction / perform-editing-operations.`,
        { retryable: false },
      );
    }
  }

  /** Targeted edits using transaction element IDs only. */
  async performEdits(
    operations: EditOperation[],
    pageIndex = 1,
  ): Promise<EditableElementRef[]> {
    if (!this.session?.transaction || this.session.transaction.status !== "open") {
      throw new CanvaAdapterError(
        "premature_edit",
        "Open an editing transaction before perform-editing-operations",
        { retryable: false },
      );
    }
    if (operations.length === 0) {
      throw new CanvaAdapterError("validation_failed", "No edit operations provided", {
        retryable: false,
      });
    }

    for (const op of operations) {
      if (!op.element_id) {
        throw new CanvaAdapterError(
          "invalid_element_id",
          "Every edit operation requires element_id from the transaction",
          { retryable: false },
        );
      }
      this.assertEditableElement(op.element_id);
    }

    const payload = await this.callWithRetry("perform-editing-operations", {
      transaction_id: this.session.transaction.transactionId,
      transactionId: this.session.transaction.transactionId,
      page_index: pageIndex,
      pageIndex,
      operations,
    });

    // Refresh editable ids from response when present
    try {
      const refreshed = parseEditingTransaction({
        ...(typeof payload === "object" && payload ? payload : {}),
        transaction: {
          transaction_id: this.session.transaction.transactionId,
        },
        edit_design_url: this.session.transaction.editDesignUrl,
      });
      for (const el of refreshed.elements) {
        if (el.editable) this.transactionElementIds.add(el.elementId);
      }
      this.session = {
        ...this.session,
        transaction: {
          ...this.session.transaction,
          editableElements:
            refreshed.elements.length > 0
              ? refreshed.elements
              : this.session.transaction.editableElements,
        },
        phase: "edits_applied",
        updatedAt: this.now(),
      };
    } catch {
      this.setPhase("edits_applied", "[Canva] edits applied (element refresh skipped)");
    }

    return this.session.transaction?.editableElements ?? [];
  }

  /**
   * 8. Commit only after validation passes.
   */
  async commitAfterValidation(validate: () => boolean | Promise<boolean>): Promise<{
    designId: string;
    editUrl: string;
  }> {
    if (!this.session?.transaction || this.session.transaction.status !== "open") {
      throw new CanvaAdapterError(
        "premature_edit",
        "No open transaction to commit",
        { retryable: false },
      );
    }

    const ok = await validate();
    if (!ok) {
      throw new CanvaAdapterError(
        "validation_failed",
        "Validation failed — refusing to commit editing transaction",
        { retryable: false },
      );
    }

    await this.callWithRetry("commit-editing-transaction", {
      transaction_id: this.session.transaction.transactionId,
      transactionId: this.session.transaction.transactionId,
    });

    const designId = this.session.designId!;
    const editUrl = this.session.editUrl!;

    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      transaction: {
        ...this.session.transaction,
        status: "committed",
        committedAt: this.now(),
      },
      phase: "committed",
      updatedAt: this.now(),
      log: [
        ...this.session.log,
        `[Canva] committed transaction ${this.session.transaction.transactionId}`,
      ],
    });

    return this.publishHandoff();
  }

  /**
   * 9. Export only after design ID + edit URL handoff.
   * Handles async export jobs with bounded polling; respects capability poll defaults.
   */
  async exportDesign(input: {
    format: "png" | "pdf" | "jpg" | "pptx" | "mp4" | "gif" | "svg" | "other";
    pollIntervalMs?: number;
    maxPolls?: number;
    idempotencyKey?: string;
  }): Promise<{
    jobId: string | null;
    downloadUrl: string | null;
    designId: string;
    editUrl: string;
    status: "completed" | "partial" | "failed" | "pending";
  }> {
    if (!this.session?.designId || !this.session.editUrl) {
      throw new CanvaAdapterError(
        "premature_export",
        "Return/handoff design ID and edit URL before offering export",
        { retryable: false },
      );
    }
    if (
      this.session.phase !== "handoff_ready" &&
      this.session.phase !== "export_offered" &&
      this.session.phase !== "exporting" &&
      this.session.phase !== "exported"
    ) {
      throw new CanvaAdapterError(
        "premature_export",
        `Export not allowed in phase ${this.session.phase}. Publish handoff (design ID + edit URL) first.`,
        { retryable: false },
      );
    }
    if (!this.capabilities?.exportReady) {
      throw new CanvaAdapterError(
        "capability_blocked",
        "Export capability not available",
        { retryable: false },
      );
    }

    const idemKey =
      input.idempotencyKey ??
      `export:${this.session.designId}:${input.format}`;
    const cached = this.idempotency.get<{
      jobId: string | null;
      downloadUrl: string | null;
      designId: string;
      editUrl: string;
      status: "completed" | "partial" | "failed" | "pending";
    }>(idemKey, "export_design");
    if (cached) {
      await this.audit.emit({
        kind: "idempotent_replay",
        message: "Replaying export-design result",
        payload: { idempotencyKey: idemKey },
      });
      return cached;
    }

    if (this.session.phase === "handoff_ready") {
      this.setPhase("export_offered");
    }
    if (this.session.phase === "export_offered") {
      this.setPhase("exporting", `[Canva] starting export format=${input.format}`);
    }

    const maxPolls =
      input.maxPolls ??
      this.capabilities.exportPoll?.maxPolls ??
      this.env.exportMaxPolls;
    const interval =
      input.pollIntervalMs ??
      this.capabilities.exportPoll?.pollIntervalMs ??
      this.env.exportPollIntervalMs;

    const designId = this.session.designId;
    const mapStatus = (
      s: ReturnType<typeof parseExportJob>["status"],
    ): "pending" | "completed" | "failed" | "partial" => {
      if (s === "completed") return "completed";
      if (s === "failed") return "failed";
      if (s === "pending") return "pending";
      return "partial";
    };

    type ExportValue = {
      jobId: string | null;
      downloadUrl: string | null;
      rawStatus: ReturnType<typeof parseExportJob>["status"];
    };

    const polled = await pollAsyncJob<ExportValue>({
      maxPolls,
      pollIntervalMs: interval,
      sleepFn: this.sleepFn,
      onPoll: ({ poll, status }) => {
        this.emit(`[Canva] export async ${status} — poll ${poll}/${maxPolls}`);
        void this.audit.emit({
          kind: "export_poll",
          message: `Export poll ${poll}`,
          outcome: status === "completed" ? "ok" : "pending",
          payload: { poll, status, maxPolls },
        });
      },
      kickoff: async () => {
        const payload = await this.callWithRetry("export-design", {
          design_id: designId,
          designId,
          format: input.format,
        });
        const parsed = parseExportJob(payload);
        return {
          status: mapStatus(parsed.status),
          value: {
            jobId: parsed.jobId,
            downloadUrl: parsed.downloadUrl,
            rawStatus: parsed.status,
          },
        };
      },
      poll: async (prior) => {
        try {
          const payload = await this.callWithRetry("export-design", {
            design_id: designId,
            designId,
            format: input.format,
            job_id: prior.jobId,
            jobId: prior.jobId,
          });
          const parsed = parseExportJob(payload);
          return {
            status: mapStatus(parsed.status),
            value: {
              jobId: parsed.jobId ?? prior.jobId,
              downloadUrl: parsed.downloadUrl,
              rawStatus: parsed.status,
            },
          };
        } catch (err) {
          const classified = classifyMcpFailure(err);
          if (classified.code === "expired_url") {
            throw classified;
          }
          throw classified;
        }
      },
    });

    if (polled.status === "pending" || polled.status === "partial") {
      throw new CanvaAdapterError(
        "async_pending",
        polled.status === "partial"
          ? "Export job only partially complete after polling — retry later"
          : "Export job still pending after polling — retry later",
        {
          retryable: true,
          retryAfterMs: interval,
          details: {
            jobId: polled.value.jobId,
            status: polled.status,
            polls: polled.polls,
          },
        },
      );
    }
    if (polled.status === "failed") {
      throw new CanvaAdapterError("async_failed", "Export job failed", {
        retryable: true,
        details: { jobId: polled.value.jobId },
      });
    }

    const result = {
      jobId: polled.value.jobId,
      downloadUrl: polled.value.downloadUrl,
      designId: this.session.designId as string,
      editUrl: this.session.editUrl as string,
      status: "completed" as const,
    };

    this.session = CanvaAdapterSessionSchema.parse({
      ...this.session,
      exportJobId: polled.value.jobId,
      exportFormat: input.format,
      phase: "exported",
      idempotencyKeys: [...new Set([...this.session.idempotencyKeys, idemKey])],
      updatedAt: this.now(),
      log: [
        ...this.session.log,
        `[Canva] export complete jobId=${polled.value.jobId ?? "(none)"} url=${polled.value.downloadUrl ?? "(none)"}`,
      ],
    });

    return this.idempotency.remember(idemKey, "export_design", result, this.now());
  }

  async cancelEditingTransaction(): Promise<void> {
    if (!this.session?.transaction || this.session.transaction.status !== "open") {
      return;
    }
    try {
      await this.callWithRetry("cancel-editing-transaction", {
        transaction_id: this.session.transaction.transactionId,
        transactionId: this.session.transaction.transactionId,
      });
    } catch (err) {
      this.emit(
        `[Canva] cancel-editing-transaction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.session = {
      ...this.session,
      transaction: { ...this.session.transaction, status: "cancelled" },
      updatedAt: this.now(),
    };
  }
}
