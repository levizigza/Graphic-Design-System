import type {
  CanvaToolDescriptor,
  CanvaToolDiscoveryLog,
} from "../schemas/canva-session.js";
import { CanvaToolDiscoveryLogSchema } from "../schemas/canva-session.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import type { CanvaMcpClient } from "./client.js";
import { CanvaAdapterError } from "./errors.js";
import { normalizeToolName } from "./tool-catalog.js";

export type DiscoveryOptions = {
  id?: string;
  now?: string;
  /** Optional pre-fetched catalog (e.g. from Cursor GetDynamicTools). */
  injectedTools?: CanvaToolDescriptor[];
};

/**
 * Discover and log currently available Canva tools.
 * Empty inventory is a valid result — production must stop, not invent tools.
 */
export async function discoverCanvaTools(
  client: CanvaMcpClient | null,
  options: DiscoveryOptions = {},
): Promise<CanvaToolDiscoveryLog> {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `canva-discovery-${now}`;

  let tools: CanvaToolDescriptor[] = [];
  let source: CanvaToolDiscoveryLog["source"] = "empty";
  const notes: string[] = [];
  let preferFilter = false;

  if (options.injectedTools && options.injectedTools.length > 0) {
    tools = options.injectedTools;
    source = "injected_catalog";
    preferFilter = true;
    notes.push(`Injected ${tools.length} tool descriptor(s) from runtime catalog`);
  } else if (client) {
    try {
      tools = await client.listTools();
      source = tools.length > 0 ? "mcp_list_tools" : "empty";
      notes.push(`MCP listTools returned ${tools.length} tool(s)`);
    } catch (err) {
      notes.push(
        `listTools failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new CanvaAdapterError(
        "mcp_unavailable",
        "Canva Design MCP tool discovery failed. Connect https://mcp.canva.com/mcp and authenticate before production.",
        { retryable: true, cause: err },
      );
    }
  } else {
    notes.push(
      "No MCP client and no injected catalog — Canva Design MCP is not available in this session",
    );
  }

  const canvaLike = tools.filter((t) => {
    const n = normalizeToolName(t.name);
    const blob = `${t.name} ${t.namespace ?? ""} ${t.description ?? ""}`.toLowerCase();
    return (
      blob.includes("canva") ||
      n.includes("design") ||
      n.includes("export") ||
      n.includes("autofill") ||
      n.includes("brand-template") ||
      n.includes("editing-transaction") ||
      n.includes("editing-operations") ||
      n.includes("brand-kit")
    );
  });

  // Filter mixed injected catalogs; trust a dedicated MCP listTools inventory as-is.
  const effective =
    preferFilter && canvaLike.length > 0 ? canvaLike : tools;

  const mappedTools = effective.map((t) => {
    const row: CanvaToolDescriptor = {
      name: t.name,
      live: t.live ?? true,
    };
    if (t.namespace) row.namespace = t.namespace;
    if (t.description) row.description = t.description;
    return row;
  });

  const log = CanvaToolDiscoveryLogSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    discoveredAt: now,
    source: mappedTools.length === 0 ? "empty" : source,
    tools: mappedTools,
    normalizedNames: mappedTools.map((t) => normalizeToolName(t.name)),
    notes,
  });

  return log;
}

export function formatDiscoveryLog(log: CanvaToolDiscoveryLog): string {
  const lines = [
    `[Canva discovery] id=${log.id} at=${log.discoveredAt} source=${log.source}`,
    ...log.notes.map((n) => `  note: ${n}`),
    `  tools (${log.tools.length}):`,
    ...log.tools.map((t) => `    - ${t.name}${t.namespace ? ` @ ${t.namespace}` : ""}`),
  ];
  return lines.join("\n");
}
