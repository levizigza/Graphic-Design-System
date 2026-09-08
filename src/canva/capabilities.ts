import type {
  CanvaAccountCapabilityReport,
  CanvaCapabilityProbe,
  CanvaToolDiscoveryLog,
  CanvaToolRateLimit,
} from "../schemas/canva-session.js";
import { CanvaAccountCapabilityReportSchema } from "../schemas/canva-session.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import { DOCUMENTED_TOOL_RATE_LIMITS_PER_MIN } from "../lib/rate-limit.js";
import {
  CAPABILITY_TOOL_REQUIREMENTS,
  PLAN_HINTS,
  toolPresent,
} from "./tool-catalog.js";

export type CapabilityValidationOptions = {
  id?: string;
  now?: string;
  /**
   * Optional live probe results for plan-gated features
   * (e.g. resize/autofill returned plan_restricted from upstream).
   */
  planOverrides?: Partial<
    Record<
      keyof typeof CAPABILITY_TOOL_REQUIREMENTS,
      "available" | "plan_restricted" | "error" | "unauthenticated"
    >
  >;
  /** Live capability response rate-limit overrides (never scraped). */
  rateLimitOverrides?: Array<{ toolName: string; requestsPerMinute: number }>;
  exportPoll?: { maxPolls: number; pollIntervalMs: number };
  cacheExpiresAt?: string;
};

/**
 * Validate account capabilities for generation, editing, export, resize,
 * templates, and Autofill based on discovered tools (+ optional plan probes).
 * Attaches configurable tool rate limits from documented defaults merged with
 * any live capability-response overrides.
 */
export function validateAccountCapabilities(
  discovery: CanvaToolDiscoveryLog,
  options: CapabilityValidationOptions = {},
): CanvaAccountCapabilityReport {
  const now = options.now ?? new Date().toISOString();
  const live = new Set(discovery.normalizedNames);
  const unauthenticated =
    discovery.source === "empty" && discovery.tools.length === 0;

  const probes: CanvaCapabilityProbe[] = (
    Object.keys(CAPABILITY_TOOL_REQUIREMENTS) as Array<
      keyof typeof CAPABILITY_TOOL_REQUIREMENTS
    >
  ).map((kind) => {
    const required = [...CAPABILITY_TOOL_REQUIREMENTS[kind]];
    const present = required.filter((t) => toolPresent(live, t));
    const override = options.planOverrides?.[kind];

    let status: CanvaCapabilityProbe["status"];
    if (unauthenticated) {
      status = "unauthenticated";
    } else if (override === "plan_restricted") {
      status = "plan_restricted";
    } else if (override === "unauthenticated") {
      status = "unauthenticated";
    } else if (override === "error") {
      status = "error";
    } else if (present.length === required.length) {
      status = "available";
    } else if (present.length === 0) {
      status = "missing_tool";
    } else {
      status = "missing_tool";
    }

    const probe: CanvaCapabilityProbe = {
      kind,
      status,
      requiredTools: required,
      presentTools: present,
    };
    if (PLAN_HINTS[kind]) {
      probe.planHint = PLAN_HINTS[kind];
    }
    if (status === "missing_tool") {
      probe.detail = `Missing tools: ${required.filter((t) => !toolPresent(live, t)).join(", ")}`;
    } else if (status === "unauthenticated") {
      probe.detail =
        "Canva Design MCP not connected or not authenticated in this session";
    } else if (status === "plan_restricted") {
      probe.detail = PLAN_HINTS[kind] ?? "Plan does not include this capability";
    }
    return probe;
  });

  const byKind = Object.fromEntries(probes.map((p) => [p.kind, p])) as Record<
    string,
    CanvaCapabilityProbe
  >;

  const ready = (kind: string) => byKind[kind]?.status === "available";

  const blockingIssues: string[] = [];
  if (!ready("generation")) {
    blockingIssues.push(
      "Generation not ready — need live generate-design and create-design-from-candidate",
    );
  }
  if (!ready("editing")) {
    blockingIssues.push(
      "Editing not ready — need live start/perform/commit editing transaction tools",
    );
  }
  if (!ready("export")) {
    blockingIssues.push("Export not ready — need live export-design");
  }

  const toolRateLimits: CanvaToolRateLimit[] = Object.entries(
    DOCUMENTED_TOOL_RATE_LIMITS_PER_MIN,
  ).map(([toolName, requestsPerMinute]) => ({
    toolName,
    requestsPerMinute,
    source: "documented_default" as const,
  }));

  for (const o of options.rateLimitOverrides ?? []) {
    const idx = toolRateLimits.findIndex((t) => t.toolName === o.toolName);
    const row: CanvaToolRateLimit = {
      toolName: o.toolName,
      requestsPerMinute: o.requestsPerMinute,
      source: "capability_response",
    };
    if (idx >= 0) toolRateLimits[idx] = row;
    else toolRateLimits.push(row);
  }

  const report: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? `canva-caps-${now}`,
    createdAt: now,
    updatedAt: now,
    discoveryLogId: discovery.id,
    probedAt: now,
    probes,
    generationReady: ready("generation"),
    editingReady: ready("editing"),
    exportReady: ready("export"),
    resizeReady: ready("resize"),
    templatesReady: ready("templates"),
    autofillReady: ready("autofill"),
    blockingIssues,
    toolRateLimits,
  };
  if (options.exportPoll) report.exportPoll = options.exportPoll;
  if (options.cacheExpiresAt) report.cacheExpiresAt = options.cacheExpiresAt;

  return CanvaAccountCapabilityReportSchema.parse(report);
}
