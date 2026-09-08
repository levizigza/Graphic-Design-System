import type { RetryPolicy } from "../canva/client.js";
import { DEFAULT_RETRY_POLICY, sleep } from "../canva/client.js";

export type RetryDecision = {
  retryable: boolean;
  retryAfterMs?: number;
};

export type BoundedRetryOptions = {
  policy?: RetryPolicy;
  /** Classify whether the thrown error should be retried. */
  shouldRetry: (err: unknown, attempt: number) => RetryDecision;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    err: unknown;
  }) => void | Promise<void>;
  sleepFn?: (ms: number) => Promise<void>;
};

/**
 * Bounded retries with exponential backoff, honoring Retry-After when provided.
 */
export async function withBoundedRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: BoundedRetryOptions,
): Promise<T> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const sleepFn = options.sleepFn ?? sleep;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const decision = options.shouldRetry(err, attempt);
      if (!decision.retryable || attempt >= policy.maxAttempts) {
        throw err;
      }
      const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
      const delayMs = Math.min(
        decision.retryAfterMs ?? exponential,
        policy.maxDelayMs,
      );
      await options.onRetry?.({ attempt, delayMs, err });
      await sleepFn(delayMs);
    }
  }

  throw lastErr;
}

export function computeBackoffMs(
  attempt: number,
  policy: RetryPolicy,
  retryAfterMs?: number,
): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(retryAfterMs ?? exponential, policy.maxDelayMs);
}
