/**
 * Recoverable and terminal failures for the Canva Design MCP adapter.
 * Never invent design IDs, edit URLs, or element IDs to paper over errors.
 */

export type CanvaErrorCode =
  | "mcp_unavailable"
  | "tool_missing"
  | "unauthenticated"
  | "capability_blocked"
  | "rate_limited"
  | "async_pending"
  | "async_failed"
  | "expired_url"
  | "invalid_element_id"
  | "premature_selection"
  | "premature_edit"
  | "premature_export"
  | "validation_failed"
  | "silent_choice_forbidden"
  | "readonly_element_forbidden"
  | "upstream"
  | "unknown";

export class CanvaAdapterError extends Error {
  readonly code: CanvaErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: CanvaErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "CanvaAdapterError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
    this.details = options?.details;
  }
}

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof CanvaAdapterError) return err.code === "rate_limited";
  if (!err || typeof err !== "object") return false;
  const msg = String((err as { message?: string }).message ?? err).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("429")
  );
}

export function isExpiredUrlError(err: unknown): boolean {
  if (err instanceof CanvaAdapterError) return err.code === "expired_url";
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return (
    msg.includes("expired") &&
    (msg.includes("url") || msg.includes("thumbnail") || msg.includes("download"))
  );
}

export function classifyMcpFailure(err: unknown): CanvaAdapterError {
  if (err instanceof CanvaAdapterError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (isRateLimitError(err)) {
    const retryMatch = message.match(/retry.+?(\d+)\s*(ms|s|sec|seconds)?/i);
    let retryAfterMs: number | undefined;
    if (retryMatch) {
      const n = Number(retryMatch[1]);
      const unit = (retryMatch[2] ?? "ms").toLowerCase();
      retryAfterMs = unit.startsWith("s") ? n * 1000 : n;
    }
    return new CanvaAdapterError("rate_limited", message, {
      retryable: true,
      retryAfterMs: retryAfterMs ?? 2000,
      cause: err,
    });
  }

  if (isExpiredUrlError(err)) {
    return new CanvaAdapterError("expired_url", message, {
      retryable: true,
      cause: err,
    });
  }

  if (
    lower.includes("unauthor") ||
    lower.includes("oauth") ||
    lower.includes("not authenticated") ||
    lower.includes("login")
  ) {
    return new CanvaAdapterError("unauthenticated", message, {
      retryable: false,
      cause: err,
    });
  }

  if (lower.includes("pending") || lower.includes("in_progress") || lower.includes("processing")) {
    return new CanvaAdapterError("async_pending", message, {
      retryable: true,
      retryAfterMs: 1500,
      cause: err,
    });
  }

  return new CanvaAdapterError("upstream", message, {
    retryable: true,
    cause: err,
  });
}
