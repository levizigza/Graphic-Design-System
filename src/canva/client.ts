import type { CanvaToolDescriptor } from "../schemas/canva-session.js";

/**
 * Thin port over Canva Design MCP.
 * The Cursor agent or a remote MCP bridge implements this —
 * the adapter never talks to undocumented APIs or scrapes the editor.
 */
export type CanvaMcpCallResult = {
  content: unknown;
  isError?: boolean;
};

export interface CanvaMcpClient {
  /** Live tool list from the MCP server — do not hardcode. */
  listTools(): Promise<CanvaToolDescriptor[]>;
  /** Invoke a Design MCP tool by its live name. */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CanvaMcpCallResult>;
}

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 800,
  maxDelayMs: 8000,
};

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
