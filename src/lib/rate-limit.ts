/**
 * Documented Design MCP per-tool rate limits (requests per minute).
 * Source: https://www.canva.dev/docs/mcp/tools/ — used as defaults until a
 * live capability response supplies overrides. Do not invent tighter/looser
 * undocumented limits.
 */
export const DOCUMENTED_TOOL_RATE_LIMITS_PER_MIN: Readonly<
  Record<string, number>
> = {
  "generate-design": 20,
  "create-design-from-candidate": 20,
  "copy-design": 20,
  "search-designs": 100,
  "get-design": 100,
  "get-design-content": 100,
  "get-design-pages": 100,
  "get-design-thumbnail": 100,
  "get-export-formats": 100,
  "start-editing-transaction": 20,
  "perform-editing-operations": 50,
  "commit-editing-transaction": 20,
  "cancel-editing-transaction": 20,
  "upload-asset-from-url": 30,
  "get-assets": 100,
  "export-design": 20,
  "create-folder": 20,
  "list-folder-items": 100,
  "search-folders": 100,
  "move-item-to-folder": 100,
  "comment-on-design": 100,
  "list-comments": 100,
  "list-replies": 100,
  "reply-to-comment": 20,
  "resize-design": 20,
  "search-brand-templates": 100,
  "list-brand-kits": 100,
  "create-design-from-brand-template": 20,
  "autofill-design": 60,
  "get-brand-template-dataset": 100,
  "import-design-from-url": 20,
};

export type ToolRateLimit = {
  toolName: string;
  requestsPerMinute: number;
  source: "documented_default" | "capability_response" | "config_override";
};

export type RateLimitWait = {
  toolName: string;
  waitMs: number;
  requestsPerMinute: number;
};

/**
 * Sliding-window rate limiter. Configurable from live capability response.
 */
export class ToolRateLimiter {
  private readonly windows = new Map<string, number[]>();
  private readonly limits = new Map<string, ToolRateLimit>();
  private readonly nowMs: () => number;

  constructor(options?: {
    nowMs?: () => number;
    initialLimits?: ToolRateLimit[];
  }) {
    this.nowMs = options?.nowMs ?? (() => Date.now());
    for (const [toolName, rpm] of Object.entries(
      DOCUMENTED_TOOL_RATE_LIMITS_PER_MIN,
    )) {
      this.limits.set(toolName, {
        toolName,
        requestsPerMinute: rpm,
        source: "documented_default",
      });
    }
    for (const lim of options?.initialLimits ?? []) {
      this.limits.set(lim.toolName, lim);
    }
  }

  /** Apply overrides from a live capability / config payload. */
  applyOverrides(
    overrides: Array<{ toolName: string; requestsPerMinute: number }>,
    source: ToolRateLimit["source"] = "capability_response",
  ): void {
    for (const o of overrides) {
      if (o.requestsPerMinute <= 0) continue;
      this.limits.set(o.toolName, {
        toolName: o.toolName,
        requestsPerMinute: o.requestsPerMinute,
        source,
      });
    }
  }

  getLimit(toolName: string): ToolRateLimit | undefined {
    return this.limits.get(toolName);
  }

  /**
   * Block until a slot is available for the tool, then record the call.
   */
  async acquire(
    toolName: string,
    sleepFn: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ): Promise<RateLimitWait | null> {
    const lim = this.limits.get(toolName);
    if (!lim) {
      // Unknown tool — do not invent a limit; proceed without throttle.
      return null;
    }

    const windowMs = 60_000;
    let wait: RateLimitWait | null = null;

    for (;;) {
      const now = this.nowMs();
      const stamps = (this.windows.get(toolName) ?? []).filter(
        (t) => now - t < windowMs,
      );
      if (stamps.length < lim.requestsPerMinute) {
        stamps.push(now);
        this.windows.set(toolName, stamps);
        return wait;
      }
      const oldest = stamps[0]!;
      const waitMs = Math.max(1, windowMs - (now - oldest) + 1);
      wait = {
        toolName,
        waitMs,
        requestsPerMinute: lim.requestsPerMinute,
      };
      await sleepFn(waitMs);
    }
  }
}
