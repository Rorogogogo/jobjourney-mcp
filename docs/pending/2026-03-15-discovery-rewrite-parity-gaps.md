# Discovery Rewrite Parity Gaps

**Date:** 2026-03-15

This note tracks what is still missing before the TypeScript discovery rewrite can replace the Python crawler completely.

## Ported And Verified

- discovery core types and source registry
- shared rate limiting and HTTP wrapper
- discovery orchestration with per-source failure isolation
- LinkedIn guest search parsing
- LinkedIn guest detail parsing
- LinkedIn guest source execution
- LinkedIn external apply URL extraction order
- ATS detection and URL normalization
- ATS expansion for supported providers
- Greenhouse normalization
- Lever normalization
- salary normalization
- work arrangement / employment type / experience heuristics
- PR / clearance detection
- SEEK browser output normalization into the canonical discovery job shape
- additive SQLite storage support for the richer discovery schema
- initial MCP exposure through `discover_jobs`
- company-site career discovery fallback
- fallback gating and cache behavior
- discovery scheduling through MCP and the background agent
- latest discovery run reporting through MCP
- formal Python-vs-TS fixture parity harness
- initial side-by-side parity comparison for LinkedIn search/detail, ATS detection, and salary normalization
- live TS smoke checks for LinkedIn guest discovery and direct Greenhouse crawling
- automated live TS-vs-Python LinkedIn parity smoke runner
- recorded live parity report artifact for the default `full stack` / `Sydney` smoke query

## Remaining Gaps

- `Indeed` and `Jora` browser sources are not implemented beyond the planned-source registry entries.
- parity coverage is still limited to the initial canonical fixture set and should be expanded as more edge cases are discovered.
- live parity coverage is still limited to a single default LinkedIn smoke query and should be broadened to more queries and ATS outcomes.
- the legacy browser LinkedIn scraper in `src/scraper` should be kept only as an internal transition fallback and removed once the `linkedin-guest` path has stable parity and live smoke coverage.

## Current Recommendation

Treat the Python crawler as the behavior oracle until the following are done:

1. expand the fixture parity manifest when new parser or normalization edge cases are found
2. broaden the recorded live parity smoke set beyond the default LinkedIn query
