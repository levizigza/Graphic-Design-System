const SENSITIVE_KEY =
  /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|client[_-]?secret|bearer|cookie|set-cookie|x-api-key)$/i;

const TOKENISH =
  /\b(Bearer\s+[A-Za-z0-9\-._~+/]+=*|sk-[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gi;

export const REDACTED = "[REDACTED]";

export function redactString(value: string): string {
  return value.replace(TOKENISH, REDACTED);
}

/**
 * Deep-clone-ish redaction for audit payloads.
 * Never logs credentials, tokens, or Authorization headers.
 */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactForAudit(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactForAudit(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}
