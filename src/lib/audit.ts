import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  AuditEventSchema,
  type AuditEvent,
  type AuditEventKind,
} from "../schemas/structured-error.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import { createOpaqueId } from "./ids.js";
import { redactForAudit } from "./redact.js";

export type AuditSink = (event: AuditEvent) => void | Promise<void>;

export type AuditLoggerOptions = {
  correlationId: string;
  jobId?: string;
  now?: () => string;
  sinks?: AuditSink[];
  /** Optional durable JSONL path — values are always redacted before write. */
  filePath?: string | null;
};

export class AuditLogger {
  private readonly correlationId: string;
  private readonly jobId: string | undefined;
  private readonly now: () => string;
  private readonly sinks: AuditSink[];
  private readonly filePath: string | null;
  private readonly events: AuditEvent[] = [];

  constructor(options: AuditLoggerOptions) {
    this.correlationId = options.correlationId;
    this.jobId = options.jobId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.sinks = options.sinks ?? [];
    this.filePath = options.filePath ?? null;
  }

  getEvents(): readonly AuditEvent[] {
    return this.events;
  }

  async emit(input: {
    kind: AuditEventKind;
    message: string;
    outcome?: AuditEvent["outcome"];
    requestId?: string;
    toolName?: string;
    phase?: string;
    payload?: Record<string, unknown>;
  }): Promise<AuditEvent> {
    const now = this.now();
    const raw: Record<string, unknown> = {
      schemaVersion: SCHEMA_VERSION,
      id: createOpaqueId("audit"),
      createdAt: now,
      updatedAt: now,
      kind: input.kind,
      correlationId: this.correlationId,
      outcome: input.outcome ?? "ok",
      payload: redactForAudit(input.payload ?? {}) as Record<string, unknown>,
      message: input.message,
    };
    if (this.jobId) raw.jobId = this.jobId;
    if (input.requestId) raw.requestId = input.requestId;
    if (input.toolName) raw.toolName = input.toolName;
    if (input.phase) raw.phase = input.phase;

    const event = AuditEventSchema.parse(raw);
    this.events.push(event);

    for (const sink of this.sinks) {
      await sink(event);
    }

    if (this.filePath) {
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    }

    return event;
  }
}
