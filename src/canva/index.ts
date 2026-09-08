export type { CanvaMcpClient, CanvaMcpCallResult, RetryPolicy } from "./client.js";
export { DEFAULT_RETRY_POLICY, sleep } from "./client.js";

export {
  CanvaAdapterError,
  classifyMcpFailure,
  isRateLimitError,
  isExpiredUrlError,
  type CanvaErrorCode,
} from "./errors.js";

export {
  DOCUMENTED_DESIGN_MCP_TOOLS,
  CAPABILITY_TOOL_REQUIREMENTS,
  PLAN_HINTS,
  normalizeToolName,
  toolPresent,
  resolveLiveToolName,
  type DocumentedCanvaTool,
} from "./tool-catalog.js";

export { discoverCanvaTools, formatDiscoveryLog } from "./discovery.js";
export { validateAccountCapabilities } from "./capabilities.js";
export { buildGenerationPromptFromSpec } from "./prompt.js";
export {
  unwrapMcpContent,
  parseCandidates,
  parseCreatedDesign,
  parseEditingTransaction,
  parseExportJob,
  assertNotReadonlyContentElementId,
} from "./parse.js";

export { CanvaAdapter, type EditOperation, type CanvaAdapterOptions } from "./adapter.js";

export { AuditLogger, type AuditLoggerOptions, type AuditSink } from "../lib/audit.js";
export { CapabilityCache, type CachedCapability } from "../lib/capability-cache.js";
export {
  loadEnvConfig,
  describeEnvConfig,
  readSecret,
  SECRET_ENV_KEYS,
  type EnvConfig,
  type SecretEnvKey,
} from "../lib/env.js";
export {
  createJobId,
  createCorrelationId,
  createRequestId,
  createIdempotencyKey,
} from "../lib/ids.js";
export {
  ToolRateLimiter,
  DOCUMENTED_TOOL_RATE_LIMITS_PER_MIN,
  type ToolRateLimit,
} from "../lib/rate-limit.js";
export { withBoundedRetry, computeBackoffMs } from "../lib/retry.js";
export { pollAsyncJob } from "../lib/poll.js";
export { JobStore } from "../lib/job-store.js";
export { redactForAudit, redactString, REDACTED } from "../lib/redact.js";
export {
  IdempotencyStore,
  assertPhaseTransition,
  ALLOWED_PHASE_TRANSITIONS,
} from "../lib/idempotency.js";
