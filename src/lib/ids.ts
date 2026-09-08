import { randomBytes } from "node:crypto";

/** Compact opaque id (no secrets). */
export function createOpaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function createJobId(): string {
  return createOpaqueId("job");
}

/** Ties all work for one user/agent request across modules. */
export function createCorrelationId(): string {
  return createOpaqueId("corr");
}

/** Per MCP/tool invocation. */
export function createRequestId(): string {
  return createOpaqueId("req");
}

export function createIdempotencyKey(scope: string): string {
  return createOpaqueId(`idem_${scope}`);
}
