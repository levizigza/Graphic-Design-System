import type { CanvaCapabilityKind } from "../schemas/canva-session.js";

/**
 * Documented Design MCP tool names (reference).
 * Live discovery must confirm presence — never assume these are connected.
 * Source: https://www.canva.dev/docs/mcp/tools/
 */
export const DOCUMENTED_DESIGN_MCP_TOOLS = [
  "generate-design",
  "create-design-from-candidate",
  "search-designs",
  "get-design",
  "get-design-content",
  "get-design-pages",
  "get-design-thumbnail",
  "get-export-formats",
  "start-editing-transaction",
  "perform-editing-operations",
  "commit-editing-transaction",
  "cancel-editing-transaction",
  "upload-asset-from-url",
  "export-design",
  "resize-design",
  "search-brand-templates",
  "list-brand-kits",
  "create-design-from-brand-template",
  "autofill-design",
  "get-brand-template-dataset",
  "copy-design",
  "import-design-from-url",
  "comment-on-design",
] as const;

export type DocumentedCanvaTool = (typeof DOCUMENTED_DESIGN_MCP_TOOLS)[number];

/** Capability → minimum tools that must be live. */
export const CAPABILITY_TOOL_REQUIREMENTS: Record<
  CanvaCapabilityKind,
  readonly string[]
> = {
  generation: ["generate-design", "create-design-from-candidate"],
  editing: [
    "start-editing-transaction",
    "perform-editing-operations",
    "commit-editing-transaction",
  ],
  export: ["export-design"],
  resize: ["resize-design"],
  templates: [
    "search-brand-templates",
    "create-design-from-brand-template",
  ],
  autofill: ["autofill-design", "get-brand-template-dataset"],
};

export const PLAN_HINTS: Partial<Record<CanvaCapabilityKind, string>> = {
  resize: "Canva Pro and above (per Canva MCP docs)",
  templates: "Canva Pro and above for brand templates (per Canva MCP docs)",
  autofill: "Canva Enterprise only (per Canva MCP docs)",
};

/** Normalize tool ids for comparison (generate-design ≡ generate_design). */
export function normalizeToolName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^canva[_:-]?/, "")
    .replace(/[_\s]+/g, "-");
}

export function toolPresent(
  liveNormalizedNames: ReadonlySet<string>,
  required: string,
): boolean {
  return liveNormalizedNames.has(normalizeToolName(required));
}

/**
 * Resolve the live tool name that matches a documented name.
 * Returns undefined if not discovered in this session.
 */
export function resolveLiveToolName(
  liveTools: ReadonlyArray<{ name: string }>,
  documentedName: string,
): string | undefined {
  const want = normalizeToolName(documentedName);
  const hit = liveTools.find((t) => normalizeToolName(t.name) === want);
  return hit?.name;
}
