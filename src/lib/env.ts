import { REDACTED } from "./redact.js";

/**
 * Secrets come only from environment configuration — never from source files,
 * committed `.env` contents, or hardcoded literals in this package.
 *
 * Canva Design MCP auth is normally handled by the Cursor/MCP host.
 * These keys exist for optional Connect / bridge deployments.
 */
export const SECRET_ENV_KEYS = [
  "CANVA_MCP_AUTH_TOKEN",
  "CANVA_CONNECT_CLIENT_ID",
  "CANVA_CONNECT_CLIENT_SECRET",
  "CANVA_CONNECT_ACCESS_TOKEN",
  "CANVA_CONNECT_REFRESH_TOKEN",
] as const;

export type SecretEnvKey = (typeof SECRET_ENV_KEYS)[number];

export type EnvConfig = {
  /** Present secret keys only — values never returned by describe(). */
  presentSecrets: SecretEnvKey[];
  jobsRoot: string;
  capabilityCacheTtlMs: number;
  maxRetryAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  exportMaxPolls: number;
  exportPollIntervalMs: number;
  auditLogPath: string | null;
};

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Environment ${name} must be a positive number`);
  }
  return Math.floor(n);
}

/**
 * Load non-secret runtime config + which secret keys are present.
 * Secret values stay in process.env and are never copied into returned objects.
 */
export function loadEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
): EnvConfig {
  const presentSecrets = SECRET_ENV_KEYS.filter(
    (k) => typeof env[k] === "string" && env[k]!.trim().length > 0,
  );

  return {
    presentSecrets,
    jobsRoot: env.GDS_JOBS_ROOT?.trim() || "artifacts/jobs",
    capabilityCacheTtlMs: readPositiveInt(
      "GDS_CAPABILITY_CACHE_TTL_MS",
      15 * 60_000,
    ),
    maxRetryAttempts: readPositiveInt("GDS_MAX_RETRY_ATTEMPTS", 4),
    retryBaseDelayMs: readPositiveInt("GDS_RETRY_BASE_DELAY_MS", 800),
    retryMaxDelayMs: readPositiveInt("GDS_RETRY_MAX_DELAY_MS", 8000),
    exportMaxPolls: readPositiveInt("GDS_EXPORT_MAX_POLLS", 20),
    exportPollIntervalMs: readPositiveInt("GDS_EXPORT_POLL_INTERVAL_MS", 1500),
    auditLogPath: env.GDS_AUDIT_LOG_PATH?.trim() || null,
  };
}

/** Safe description for diagnostics — never includes secret values. */
export function describeEnvConfig(config: EnvConfig): Record<string, unknown> {
  return {
    jobsRoot: config.jobsRoot,
    capabilityCacheTtlMs: config.capabilityCacheTtlMs,
    maxRetryAttempts: config.maxRetryAttempts,
    retryBaseDelayMs: config.retryBaseDelayMs,
    retryMaxDelayMs: config.retryMaxDelayMs,
    exportMaxPolls: config.exportMaxPolls,
    exportPollIntervalMs: config.exportPollIntervalMs,
    auditLogPath: config.auditLogPath,
    presentSecrets: config.presentSecrets.map((k) => ({
      key: k,
      value: REDACTED,
    })),
  };
}

/**
 * Read a secret for host/MCP bridge use only.
 * Callers must not log, persist, or embed the value in manifests.
 */
export function readSecret(
  key: SecretEnvKey,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const v = env[key];
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v;
}
