# Design Agent Architecture — Graphic Design System

**Project:** Graphic Design System  
**Role of this doc:** Principal-engineer baseline before application code  
**Companion docs:** [canva-capability-matrix.md](./canva-capability-matrix.md) · [implementation-plan.md](./implementation-plan.md) · [diagrams/design-agent-state-machine.md](./diagrams/design-agent-state-machine.md)

---

## 0. Repository inspection summary

| Artifact | Finding |
| --- | --- |
| Source tree | Empty workspace (created 2026-09-07); no app code |
| `package.json` / `pyproject.toml` / lockfiles | None |
| `AGENTS.md` | None |
| `.env` / secrets | None |
| Git remote / history | Not initialized at inspection time |
| Existing Canva integration | None in repo |
| Live Canva Design MCP | **Not connected** (see capability matrix) |
| Live Canva Dev MCP | **Not connected** |
| Nearby related projects | Unrelated stacks exist under Documents (e.g. StudioLine-AI audio monorepo); **not** adopted as this project's stack |

**Implication:** There is no “existing stack” to extend. Milestone 0 bootstraps a minimal TypeScript coordinator that treats Cursor + Canva Design MCP as the production connector and keeps job state on the local filesystem.

---

## 1. Design principles

1. **One coordinator workflow** — a single state machine owns the job; modules are pure steps, not competing services.
2. **Design MCP for production** — create/edit/export only through Canva Design MCP; Dev MCP is docs/code assistance only.
3. **Discover, don’t assume** — tool names and auth are read from the live session and recorded in the capability matrix before production.
4. **Handoff always** — every design artifact stores an editable Canva URL.
5. **Versioned truth locally** — `manifest.json` is the system of record for versions, prompts, tool calls, and export checksums.
6. **Smallest path to Milestone 1** — poster + business card; no marketplace app, no Connect API backend, no multi-tenant SaaS.

---

## 2. Target architecture (simplest)

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (state machine)              │
│  loads brief → advances states → writes manifest → retries  │
└───────────┬─────────────────────────────────────────────────┘
            │
   ┌────────┼────────┬──────────┬──────────┬──────────┬────────┐
   ▼        ▼        ▼          ▼          ▼          ▼        ▼
 Brief   Brand    Concept    Canva      Preflight  Critique  Archive
 Analysis Intel   Generation Production
   │        │        │          │
   │        │        │          ├── Design MCP (required)
   │        │        │          └── Dev MCP (optional, engineer only)
   └────────┴────────┴──────────┴──► artifacts/jobs/<jobId>/
```

### Modules

| Module | Input | Output | Side effects |
| --- | --- | --- | --- |
| **Brief analysis** | Raw brief (text/JSON) | Normalized `BriefSpec` (audience, offer, formats, constraints, must-include copy) | Writes `01-brief.json` |
| **Brand intelligence** | Brief + brand kit path / URLs | `BrandProfile` (colors, fonts, voice, logo asset refs) | Writes `02-brand.json`; may upload assets via Design MCP |
| **Concept generation** | Brief + brand | 2–3 `Concept` cards with layout thesis + copy blocks | Writes `03-concepts.json`; human or auto pick |
| **Canva production** | Selected concepts × formats | Canva design IDs + edit URLs | Design MCP generate → create → optional edit transaction |
| **Preflight** | Design IDs | Pass/fail checklist (bleed/safe area heuristics via content + dimensions, required strings present) | Writes `04-preflight.json` |
| **Critique** | Design + brief + brand | Score + revision instructions | Writes `05-critique.json`; may loop to production |
| **Archiving** | All artifacts + exports | Frozen job folder + optional Canva folder | Writes `manifest.json` vN; copies exports |

Coordinator rules:

- Linear happy path with one critique loop (max N=2 revisions).
- Fail closed if Design MCP tools are missing or unauthenticated.
- Never invent Canva IDs or edit links.

---

## 3. Job data model (versioned metadata)

Path: `artifacts/jobs/<jobId>/manifest.json`

```json
{
  "schemaVersion": 1,
  "jobId": "20260907-m1-demo",
  "project": "Graphic Design System",
  "status": "archived",
  "createdAt": "2026-09-08T03:40:00Z",
  "updatedAt": "2026-09-08T04:10:00Z",
  "version": 3,
  "briefRef": "01-brief.json",
  "brandRef": "02-brand.json",
  "conceptRef": "03-concepts.json",
  "selectedConceptId": "concept-b",
  "designs": [
    {
      "format": "poster",
      "designId": "REPLACE_AFTER_LIVE_MCP",
      "editUrl": "https://www.canva.com/design/.../edit",
      "candidateId": "...",
      "export": {
        "format": "png",
        "path": "exports/poster.png",
        "bytes": 0,
        "sha256": "",
        "verifiedAt": null
      }
    },
    {
      "format": "business_card",
      "designId": "REPLACE_AFTER_LIVE_MCP",
      "editUrl": "https://www.canva.com/design/.../edit",
      "export": {
        "format": "pdf",
        "path": "exports/business-card.pdf",
        "bytes": 0,
        "sha256": "",
        "verifiedAt": null
      }
    }
  ],
  "toolDiscovery": {
    "recordedAt": "2026-09-08T03:32:00Z",
    "canvaDesignMcpConnected": false,
    "toolsSeen": []
  },
  "history": []
}
```

Versioning: each state transition appends a `history[]` entry and bumps `version`. Exports are immutable files; re-export creates `exports/v<N>/`.

---

## 4. Canva production sequence (happy path)

```
generate-design(brief for format)
  → review candidates
  → create-design-from-candidate
  → record edit URL
  → [optional] start-editing-transaction
       → perform-editing-operations
       → commit-editing-transaction
  → get-design-content (preflight)
  → export-design
  → verify file on disk
  → archive
```

Always surface the edit URL to the operator after create/edit (Canva design-edit handoff pattern).

---

## 5. State machine

Canonical diagram: [diagrams/design-agent-state-machine.md](./diagrams/design-agent-state-machine.md)

States: `INIT` → `BRIEF_READY` → `BRAND_READY` → `CONCEPTS_READY` → `PRODUCING` → `PREFLIGHT` → `CRITIQUE` → (`REVISE` → `PRODUCING`) | `EXPORTING` → `ARCHIVING` → `DONE`, with `BLOCKED_NO_MCP` and `FAILED` terminals.

---

## 6. Milestone 1 definition of done

Deliver **one poster** and **one business card** such that:

1. Both exist as real Canva designs with **working edit links** stored in `manifest.json`.
2. Manifest is **versioned** (`version` ≥ 1 with history of transitions).
3. Exports exist under `artifacts/jobs/<jobId>/exports/` with **non-zero size** and recorded **SHA-256**.
4. Capability matrix Section 1 shows Design MCP **connected** and tools used listed.
5. No Dev MCP calls were required for the deliverable path.

---

## 7. Non-goals (until after M1)

- Custom Canva App (Apps SDK)
- Connect API production backend
- Multi-user auth / team brand kit automation (Enterprise)
- Full campaign suites, video, or auto-resize grids
- UI dashboard

---

## 8. Risk register

| Risk | Mitigation |
| --- | --- |
| Design MCP not in Cursor session | Blocker; setup in capability matrix §7 |
| Tool names differ from docs | Re-discovery; matrix Section 1 wins |
| Premium element export failure | Prefer free/licensed assets; catch `license_required` |
| Critique loop thrash | Cap revisions at 2 |
| Empty brand kit on Free plan | Ship `brand/profile.json` + logo URL upload |
