export type CachedCapability<T> = {
  value: T;
  cachedAtMs: number;
  expiresAtMs: number;
};

/**
 * In-memory capability cache with TTL. Prevents rediscovery thrash without
 * scraping or inventing undocumented Canva behavior.
 */
export class CapabilityCache<T> {
  private entry: CachedCapability<T> | null = null;
  private readonly ttlMs: number;
  private readonly nowMs: () => number;

  constructor(options: { ttlMs: number; nowMs?: () => number }) {
    this.ttlMs = options.ttlMs;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  get(): T | null {
    if (!this.entry) return null;
    if (this.nowMs() >= this.entry.expiresAtMs) {
      this.entry = null;
      return null;
    }
    return this.entry.value;
  }

  set(value: T): CachedCapability<T> {
    const cachedAtMs = this.nowMs();
    this.entry = {
      value,
      cachedAtMs,
      expiresAtMs: cachedAtMs + this.ttlMs,
    };
    return this.entry;
  }

  invalidate(): void {
    this.entry = null;
  }

  isFresh(): boolean {
    return this.get() != null;
  }

  meta(): Omit<CachedCapability<T>, "value"> | null {
    if (!this.entry || this.nowMs() >= this.entry.expiresAtMs) return null;
    return {
      cachedAtMs: this.entry.cachedAtMs,
      expiresAtMs: this.entry.expiresAtMs,
    };
  }
}
