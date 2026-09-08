# Design Agent State Machine

Project: **Graphic Design System**  
Owner: Coordinator workflow (single process / agent run)

## Diagram

```mermaid
stateDiagram-v2
    [*] --> INIT

    INIT --> DISCOVER_TOOLS: start job
    DISCOVER_TOOLS --> BLOCKED_NO_MCP: Design MCP missing or unauthenticated
    DISCOVER_TOOLS --> BRIEF_ANALYSIS: tools + auth OK

    BLOCKED_NO_MCP --> [*]

    BRIEF_ANALYSIS --> BRAND_INTEL: BriefSpec valid
    BRIEF_ANALYSIS --> FAILED: brief invalid

    BRAND_INTEL --> CONCEPT_GEN: BrandProfile ready
    BRAND_INTEL --> FAILED: brand unresolved

    CONCEPT_GEN --> AWAIT_CONCEPT_PICK: concepts written
    AWAIT_CONCEPT_PICK --> PRODUCING: concept selected

    PRODUCING --> PREFLIGHT: designs created + edit URLs stored
    PRODUCING --> FAILED: generate/create/edit error

    PREFLIGHT --> CRITIQUE: checks pass or soft-warn
    PREFLIGHT --> REVISE: hard fail (missing must-include / broken content)
    PREFLIGHT --> FAILED: unrecoverable

    CRITIQUE --> EXPORTING: score >= threshold OR revision budget exhausted
    CRITIQUE --> REVISE: score < threshold AND revisionsLeft > 0

    REVISE --> PRODUCING: apply critique via editing transaction
    REVISE --> FAILED: revision budget / edit transaction failure

    EXPORTING --> ARCHIVING: exports verified (size + sha256)
    EXPORTING --> FAILED: export or verify failure

    ARCHIVING --> DONE: manifest frozen
    ARCHIVING --> FAILED: archive write failure

    DONE --> [*]
    FAILED --> [*]
```

## State contracts

| State | Entry condition | Exit artifact | Next |
| --- | --- | --- | --- |
| `INIT` | `jobId` assigned | empty job folder | discover |
| `DISCOVER_TOOLS` | live MCP catalog read | `toolDiscovery` on manifest | brief or blocked |
| `BLOCKED_NO_MCP` | no Design MCP tools / auth fail | matrix note | terminal |
| `BRIEF_ANALYSIS` | brief input present | `01-brief.json` | brand |
| `BRAND_INTEL` | brief ready | `02-brand.json` | concepts |
| `CONCEPT_GEN` | brand ready | `03-concepts.json` | pick |
| `AWAIT_CONCEPT_PICK` | ≥1 concept | `selectedConceptId` | produce |
| `PRODUCING` | concept + formats | design IDs + edit URLs | preflight |
| `PREFLIGHT` | designs exist | `04-preflight.json` | critique / revise |
| `CRITIQUE` | preflight done | `05-critique.json` | export / revise |
| `REVISE` | critique instructs changes | edit transaction committed | producing |
| `EXPORTING` | critique accepted | verified files under `exports/` | archive |
| `ARCHIVING` | exports verified | `manifest.json` version bump | done |
| `DONE` | archive complete | frozen job | terminal |
| `FAILED` | any hard error | `error.json` | terminal |

## Transition guards (Milestone 1)

- Formats required: exactly `poster` and `business_card`.
- Max critique revisions: `2`.
- Export verify: `bytes > 0` and `sha256` length `64`.
- Edit URL required on each design before leaving `PRODUCING`.
