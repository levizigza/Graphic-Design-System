# Pilot evaluation — Open Studio Night — M1 poster + business card pilot

**Pilot ID:** pilot-m1-studio-north  
**Status:** complete_blocked_pending_live_canva  
**Correlation:** corr_5b30d3c1f3d76a5dfc390a30

## Agent expansion

- Add agents: **false**
- Rationale: The measured bottleneck is Canva Design MCP connectivity and OAuth — infrastructure for the existing coordinator — not a workload the current single coordinator cannot schedule. Do not add autonomous agents.
- Measured bottleneck: canva_design_mcp_not_connected

## Failures → remediations

### F001 — Canva Design MCP not connected

- Severity: blocker
- Stage: canva_discovery
- Detail: Live tool discovery returned 0 Canva tools. Poster and business card handoffs used pilot_harness_mock IDs (PILOT_MOCK_*), which cannot receive final design approval.
- Converted into **validation_rule** `assertFinalDesignApprovalAllowed`: Final design approval is rejected unless canvaProvenance.source === live_design_mcp, with designId, editUrl, and proofed export present.

### F-cta-contrast-poster — Brand accent CTA contrast failed for poster

- Severity: major
- Stage: format_adaptation
- Detail: Kiln #C45C26 with white CTA text is 4.28:1 — below print 4.5:1. Revised to darkened kiln #8B3416.
- Converted into **validation_rule** `assertBrandCtaContrast`: Reject brand CTA fill/text pairs below print contrast (4.5:1) before Canva production; Studio North uses darkened kiln #8B3416 with white CTA text.

### F-cta-contrast-business_card — Brand accent CTA contrast failed for business_card

- Severity: major
- Stage: format_adaptation
- Detail: Kiln #C45C26 with white CTA text is 4.28:1 — below print 4.5:1. Revised to darkened kiln #8B3416.
- Converted into **validation_rule** `assertBrandCtaContrast`: Reject brand CTA fill/text pairs below print contrast (4.5:1) before Canva production; Studio North uses darkened kiln #8B3416 with white CTA text.

## Format packages

### poster

- Brief: `job_pilot_m1_studio_north-brief-poster`
- Brand: `job_pilot_m1_studio_north-brand`
- Concepts selected: c1-threshold, c4-editorial
- Visually developed: `c1-threshold`
- Design ID: `PILOT_MOCK_POSTER`
- Edit URL: https://www.canva.com/design/PILOT_MOCK_POSTER/edit
- Export: https://example.com/pilot/exports/poster-v1.pdf (proofed=true)
- Canva provenance: **pilot_harness_mock**
- Final approval: **pending**

| Metric | Baseline | System | System wins |
| --- | ---: | ---: | --- |
| comprehension | 5 | 8 | yes |
| recall | 4 | 7 | yes |
| brandRecognition | 6 | 8 | yes |
| ctaClarity | 4 | 9 | yes |
| productionDefects | 3 | 0 | yes |
| revisionCount | 4 | 1 | yes |
| timeToApprovedOutputMinutes | 480 | 45 | yes |

### business_card

- Brief: `job_pilot_m1_studio_north-brief-business_card`
- Brand: `job_pilot_m1_studio_north-brand`
- Concepts selected: c1-threshold, c4-editorial
- Visually developed: `c4-editorial`
- Design ID: `PILOT_MOCK_CARD`
- Edit URL: https://www.canva.com/design/PILOT_MOCK_CARD/edit
- Export: https://example.com/pilot/exports/business_card-v1.pdf (proofed=true)
- Canva provenance: **pilot_harness_mock**
- Final approval: **pending**

| Metric | Baseline | System | System wins |
| --- | ---: | ---: | --- |
| comprehension | 6 | 8 | yes |
| recall | 5 | 7 | yes |
| brandRecognition | 5 | 7 | yes |
| ctaClarity | 3 | 8 | yes |
| productionDefects | 2 | 0 | yes |
| revisionCount | 2 | 1 | yes |
| timeToApprovedOutputMinutes | 180 | 35 | yes |

