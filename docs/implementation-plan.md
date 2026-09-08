# Implementation Plan — Graphic Design System

**Context:** Greenfield repo (no package manager, no `AGENTS.md`, no Canva connector).  
**Stack decision:** Minimal **TypeScript (Node 20+)** coordinator + **filesystem job store** + **Cursor agent** invoking **Canva Design MCP**. No web UI for Milestone 1.

Why TypeScript: matches Cursor agent workflows, easy JSON schemas, one runtime for CLI + later Connect SDK if needed. Why not adopt StudioLine-AI’s Python monorepo: different domain; would add irrelevant audio packages.

---

## Phase 0 — Connect & discover (blocker)

**Goal:** Live Design MCP tools visible to the agent.

1. Add Canva Design MCP to Cursor (`mcp-remote` → `https://mcp.canva.com/mcp`). See [canva-capability-matrix.md](./canva-capability-matrix.md) §7.
2. Complete OAuth when prompted.
3. Re-run live tool discovery; update matrix Section 1.
4. Smoke: search recent designs or generate a disposable test design, then discard/archive.

**Exit:** `canvaDesignMcpConnected: true` with non-empty `toolsSeen`.

Optional: enable Canva Dev MCP for engineers only; never on the M1 production path.

---

## Phase 1 — Repo bootstrap (existing-stack substitute)

Create the minimal tree (no overbuild):

```
Graphic Design System/
  AGENTS.md                 # operator rules for the design agent
  package.json              # type:module, tsx, zod
  tsconfig.json
  src/
    coordinator.ts          # state machine driver
    types.ts                # BriefSpec, BrandProfile, Manifest
    modules/
      brief.ts
      brand.ts
      concepts.ts
      canva-production.ts   # MCP call orchestration helpers / prompts
      preflight.ts
      critique.ts
      archive.ts
    lib/
      manifest.ts
      hash.ts
      job-fs.ts
  briefs/
    m1-demo.json            # first milestone brief
  brand/
    profile.json            # colors, fonts, voice, logoUrl
  artifacts/jobs/           # gitignored outputs
  docs/                     # architecture (already present)
```

Scripts:

- `npm run job -- --brief briefs/m1-demo.json` — run coordinator through DONE or BLOCKED.
- `npm run discover` — print/record MCP discovery reminder (human/agent checklist).

**Note:** MCP tools are invoked by the Cursor agent, not by Node calling HTTP to Canva directly in M1. The TypeScript package validates schemas, writes manifests, verifies exports, and encodes the state machine so runs are repeatable. The agent executes Design MCP tools at `PRODUCING` / `EXPORTING` per coordinator instructions in `AGENTS.md`.

---

## Phase 2 — Module contracts (implement in order)

| Order | Module | Acceptance |
| --- | --- | --- |
| 1 | `manifest` + job FS | Create job folder; bump versions; append history |
| 2 | Brief analysis | Zod-validate brief; emit `01-brief.json` |
| 3 | Brand intelligence | Load `brand/profile.json`; resolve logo URL |
| 4 | Concept generation | Emit 2–3 concepts; pick via flag or first ranked |
| 5 | Canva production | Agent checklist: generate → create → store edit URLs for poster + card |
| 6 | Preflight | Assert required strings via `get-design-content`; dimension notes |
| 7 | Critique | Rubric (brand fit, hierarchy, legibility); revise ≤2 |
| 8 | Archive | Verify exports; freeze manifest; write `DONE` |

---

## Phase 3 — Milestone 1 production run

**Brief (example fields in `briefs/m1-demo.json`):**

- Brand / product name (hero-level)
- One headline + one supporting sentence per format
- Poster size (e.g. 18×24 in or 1080×1350 px social poster — pick one and lock it)
- Business card (standard 3.5×2 in, front only for M1)
- Must-include: URL or phone, logo

**Run:**

1. Coordinator → `DISCOVER_TOOLS` (agent updates matrix).
2. Analyze brief → brand → concepts → select.
3. Produce poster; store `editUrl`.
4. Produce business card; store `editUrl`.
5. Preflight + critique (revise if needed).
6. Export PNG (poster) + PDF (card); hash files.
7. Archive; paste both edit links in the job README.

**DoD:** Matches architecture §6.

---

## Phase 4 — Hardening (post-M1)

- Optional Connect API worker for headless CI exports (Dev MCP helps author this).
- Canva folder per job via folder tools.
- Brand kit tools if account is Pro+/Enterprise.
- `resize-design` for channel variants (Pro+).
- Critique comments via `comment-on-design`.

---

## Work sequence (calendar-agnostic)

```
[0] Connect Design MCP ──► [1] Bootstrap TS + AGENTS.md
         │                         │
         ▼                         ▼
[2] Implement modules 1–4 ──► [3] Agent production path (MCP)
         │                         │
         ▼                         ▼
[4] Preflight/critique/archive ──► [5] M1 demo job green
```

---

## Immediate next actions for the operator

1. Connect **Canva Design MCP** in Cursor and authenticate.
2. Ask the agent: “Re-discover Canva tools and update `docs/canva-capability-matrix.md` Section 1.”
3. Approve Phase 1 bootstrap (package + `AGENTS.md` + module stubs).
4. Supply real brand assets + M1 copy for `briefs/m1-demo.json`.
