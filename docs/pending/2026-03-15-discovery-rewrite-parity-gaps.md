# Discovery Rewrite Parity Gaps

**Date:** 2026-03-15

This note tracks what is still missing before the TypeScript discovery rewrite can replace the Python crawler completely.

## Ported And Verified

- discovery core types and source registry
- shared rate limiting and HTTP wrapper
- LinkedIn guest search parsing
- LinkedIn guest detail parsing
- LinkedIn external apply URL extraction order
- ATS detection and URL normalization
- Greenhouse normalization
- Lever normalization
- salary normalization
- work arrangement / employment type / experience heuristics
- PR / clearance detection

## Remaining Gaps

- `runDiscovery()` is still a scaffold and does not yet orchestrate real source execution.
- LinkedIn guest source has parsing functions, but not the full fetch-and-normalize source module wired into orchestration.
- ATS registry exists, but provider invocation is not yet wired into a discovery pipeline.
- company-site career discovery fallback is not ported yet.
- SQLite storage is not yet extended for the richer discovery schema.
- MCP tools do not expose the new discovery engine yet.
- existing SEEK Playwright output is not yet normalized into the new canonical discovery job shape.
- `Indeed` and `Jora` browser sources are not implemented beyond the planned-source registry entries.
- no side-by-side Python-vs-TS golden comparison harness exists yet.
- no live smoke parity run has been recorded for the new TS LinkedIn/ATS modules.

## Current Recommendation

Treat the Python crawler as the behavior oracle until the following are done:

1. wire real source execution into `runDiscovery()`
2. port career fallback
3. port storage integration
4. expose discovery through MCP tools
5. run live LinkedIn + ATS smoke parity checks
