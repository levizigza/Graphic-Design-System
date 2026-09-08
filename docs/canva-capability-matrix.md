# Canva Capability Matrix — Graphic Design System

**Discovery timestamp:** 2026-09-07T21:32 America/Denver  
**Discovery method:** Runtime catalog via Cursor dynamic MCP tools (`GetDynamicTools` full catalog + pattern search `canva|Canva|design|export|brand|poster`)  
**Workspace:** `Graphic Design System` (empty greenfield; no package files, no `AGENTS.md`, no env config, no prior connector code)

---

## 1. Live session discovery (authoritative for this agent)

| Probe | Result |
| --- | --- |
| Namespaces present | `cursor`, `cursor-app-control`, `cursor-ide-browser` |
| Canva Design MCP (`https://mcp.canva.com/mcp`) | **Not connected** — zero matching tools |
| Canva Dev MCP (`npx @canva/cli mcp`) | **Not connected** — zero matching tools |
| Canva Connect REST client / SDK in repo | **Absent** — repository has no source or dependency manifests |
| Auth state for Canva | **Unknown / unauthenticated** — cannot verify OAuth until Design MCP is added and a user completes login |
| Live tool count (Canva) | **0** |

### Live tool inventory

| Namespace | Tool | Live? | Notes |
| --- | --- | --- | --- |
| — | *(none)* | No | Re-run discovery after MCP connect; do not trust this table once tools appear |

**Rule:** Before any production run, re-discover the live tool list and replace Section 1. Documented names below are reference-only until confirmed live.

---

## 2. Connector taxonomy (which surface to use)

| Connector | Endpoint / install | Role in Graphic Design System | Status in this workspace |
| --- | --- | --- | --- |
| **Canva Design MCP** (AI Connector) | Remote `https://mcp.canva.com/mcp` (or `npx mcp-remote@latest https://mcp.canva.com/mcp`) | **Primary:** create, edit, export, search, comment on real designs | Not connected |
| **Canva Dev MCP** | Local `npx -y @canva/cli@latest mcp` | **Dev aid only:** docs, Connect/Apps SDK guidance while building integrations | Not connected |
| **Canva Connect APIs** | REST (`canva.dev` OpenAPI) | Optional later: deterministic backend jobs, DAM sync | Not present |
| Other (Zapier, Make, browser automation) | — | Out of scope for Milestone 1 | Not present |

**Policy:** Production modules call Design MCP only. Dev MCP may assist engineers writing Connect wrappers; it must not be the path that creates customer-facing designs.

---

## 3. Documented Design MCP tools (reference — not live)

Source: [Canva MCP tools and rate limits](https://www.canva.dev/docs/mcp/tools/) (fetched 2026-09-07).  
Columns: **M1** = needed for Milestone 1 (poster + business card).

### Generation & designs

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `generate-design` | All | 20/min | **Required** | Create design candidates from a brief |
| `create-design-from-candidate` | All | 20/min | **Required** | Persist chosen candidate → editable design + edit URL |
| `copy-design` | All | 20/min | Optional | Duplicate a design for variants |
| `search-designs` | All | 100/min | Useful | Find prior assets / avoid duplicates |
| `get-design` | All | 100/min | Useful | Metadata / edit URL |
| `get-design-content` | All | 100/min | **Required** | Read-only text inspection for preflight/critique |
| `get-design-pages` | All | 100/min | Useful | Multi-page checks |
| `get-presenter-notes` | All | 100/min | No | Presentations |
| `get-export-formats` | All | 100/min | Useful | Confirm export options before export |
| `get-design-thumbnail` | All | 100/min | Useful | Visual check without full export |

### Editing transactions

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `start-editing-transaction` | All | 20/min | **Required** | Open edit session; returns `element_id`s + `edit_design_url` |
| `perform-editing-operations` | All | 50/min | **Required** | Apply edits inside transaction |
| `commit-editing-transaction` | All | 20/min | **Required** | Persist draft edits |
| `cancel-editing-transaction` | All | 20/min | Useful | Abort bad edit sessions |

### Assets & export

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `upload-asset-from-url` | All | 30/min | Useful | Brand logo / photo ingest |
| `get-assets` | All | 100/min | Useful | Library lookup |
| `export-design` | All* | 20/min | **Required** | Verified PNG/PDF (etc.) downloads |

\*Export quality and premium-element licensing depend on plan; Free = standard quality; Pro+ = higher quality / transparent PNG; premium elements may fail with `license_required`.

### Folders & organization

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `create-folder` | All | 20/min | Useful | Job archive folder in Canva |
| `list-folder-items` | All | 100/min | Useful | Inventory |
| `search-folders` | All | 100/min | Useful | Locate project folders |
| `move-item-to-folder` | All | 100/min | Useful | File designs under job ID |

### Comments (critique loop)

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `comment-on-design` | All | 100/min | Optional | Leave critique notes in Canva |
| `list-comments` / `list-replies` / `reply-to-comment` | All | 100 / 100 / 20 | Optional | Threaded feedback |

### Brand / autofill / resize (plan-gated)

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `resize-design` | Pro+ | 20/min | Optional | Channel variants |
| `search-brand-templates` | Pro+ | 100/min | Optional | Template discovery |
| `list-brand-kits` | Pro+ | 100/min | Optional | Brand kit listing |
| `create-design-from-brand-template` | Pro+ | 20/min | Optional | Template → design |
| `autofill-design` | Enterprise | 60/min | No (M1) | Dataset fill |
| `get-brand-template-dataset` | Enterprise | 100/min | No (M1) | Dataset schema |

### Imports & shortlinks

| Tool | Plan | Rate | M1 | Capability |
| --- | --- | --- | --- | --- |
| `import-design-from-url` | All | 20/min | No | Import external design |
| `resolve-shortlink` | All | Unlimited | Useful | Normalize shared links |

---

## 4. Milestone 1 capability checklist

| Requirement | Expected Design MCP path | Live verified? |
| --- | --- | --- |
| One poster | `generate-design` → `create-design-from-candidate` (format: poster) | No — MCP offline |
| One business card | Same flow (format: business card) | No — MCP offline |
| Editable Canva links | Capture `edit_url` / `edit_design_url` / `design_summary.urls.edit_url` per [design edit handoff](https://www.canva.dev/docs/mcp/workflows/design-edit/) | No |
| Versioned metadata | Local `artifacts/jobs/<jobId>/manifest.json` (agent-owned; not a Canva tool) | Spec only |
| Verified exports | `export-design` + checksum/size check into `artifacts/jobs/<jobId>/exports/` | No |

---

## 5. Gap vs architecture modules

| Module | Needs live Canva tools? | Fallback until connected |
| --- | --- | --- |
| Brief analysis | No | Local LLM + schema |
| Brand intelligence | Prefer `list-brand-kits` / assets if Pro+; else brief + uploaded URLs | Manual brand JSON |
| Concept generation | No (structured concepts) then Design MCP | Local concept JSON only |
| Canva production | **Yes** | Blocked |
| Preflight | Prefer `get-design-content` + thumbnail | Blocked for Canva-side |
| Critique | Optional comments tools | Local critique report |
| Archiving | Folders tools optional; local FS required | Local FS only |

---

## 6. Re-discovery procedure (mandatory before each production milestone)

1. Catalog all MCP namespaces in the live Cursor session.
2. Filter for Canva Design MCP tools; record exact tool names (do not assume docs match).
3. Probe auth with a read-only call (e.g. `search-designs` with a trivial query) and record success/failure.
4. Update **Section 1** of this file with timestamp, tool list, and auth result.
5. Mark Section 3 rows as Live Confirmed / Missing / Renamed.

---

## 7. Cursor setup (blocker for Milestone 1)

Add Canva Design MCP to Cursor MCP settings (user or project), then complete OAuth when prompted. Example stdio bridge (from Canva docs):

```json
{
  "mcpServers": {
    "Canva": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://mcp.canva.com/mcp"]
    }
  }
}
```

Optional parallel Dev MCP (engineering aid only):

```json
{
  "mcpServers": {
    "canva-dev": {
      "command": "npx",
      "args": ["-y", "@canva/cli@latest", "mcp"]
    }
  }
}
```

After connect: re-run Section 6 and update this matrix before claiming any design deliverable.
