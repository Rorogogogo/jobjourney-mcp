# TS Discovery Rewrite Design

**Date:** 2026-03-15

**Status:** Approved for planning

## Goal

Replace the temporary Python crawler with a TypeScript-native discovery engine inside `jobjourney-claude-plugin` so the product has one install surface, one MCP shell, one scheduler, and one long-term codebase.

The rewritten TS system must preserve the current Python crawler behavior exactly before any cleanup or redesign:

- LinkedIn guest discovery and detail retrieval
- apply URL extraction order and ATS detection
- Greenhouse and Lever API crawling
- rate limiting defaults and jitter strategy
- salary parsing
- job metadata extraction
- PR / clearance / experience heuristics
- optional career-page discovery fallback

## Product Model

The end state is one product with one MCP/plugin entrypoint and two internal acquisition modes:

- HTTP guest/API scraping for LinkedIn and ATS providers
- browser scraping for blocked sources such as SEEK

Users should not manage multiple runtimes manually. The plugin remains the public entrypoint for setup, login, scheduling, reporting, and local storage.

### Source transport policy

The long-term supported transport model is:

- `linkedin` uses direct HTTP guest scraping
- `seek` uses browser automation
- `indeed` uses browser automation
- `jora` uses browser automation

The older browser LinkedIn scraper may remain temporarily as a debugging or transition fallback, but it is not a supported product path and should be removed once `linkedin-guest` has stable parity and live smoke coverage.

## Key Decisions

### TypeScript becomes the canonical crawler runtime

The Python project is a temporary reference implementation only. It is not a permanent subprocess bridge.

The TypeScript rewrite must absorb:

- LinkedIn guest search/detail crawling
- ATS detection
- Greenhouse crawling
- Lever crawling
- career discovery fallback
- normalization and enrichment

### Parity-first migration

This rewrite is not an opportunity to simplify behavior on the first pass.

Migration rule:

1. copy current Python behavior into TS
2. prove parity with fixtures and smoke tests
3. only then clean up old plugin scraper structure or remove Python

That applies to:

- types
- field names
- default delays
- pagination
- extraction order
- ATS mappings
- salary normalization
- experience heuristics
- career discovery gating

### One canonical TS job schema

The new discovery engine should use one normalized job type that preserves the useful fields from the Python crawler and the existing plugin browser scrapers.

Required fields:

- `id`
- `title`
- `company`
- `location`
- `description`
- `source`
- `jobUrl`
- `externalUrl`
- `atsType`
- `atsIdentifier`
- `postedAt`
- `extractedAt`
- `salary`
- `salaryRaw`
- `salaryMin`
- `salaryMax`
- `salaryCurrency`
- `salaryPeriod`
- `jobType`
- `workArrangement`
- `applicantCount`
- `requiredSkills`
- `techStack`
- `experienceLevel`
- `experienceYears`
- `isPrRequired`
- `securityClearance`
- `prConfidence`
- `prReasoning`
- `companyLogoUrl`
- `isAlreadyApplied`
- `appliedDateUtc`

First-pass rule: preserve the Python crawler semantics for fields it already owns, then allow browser-only sources to populate additional fields when available.

## Architecture

Create a new discovery engine inside the plugin repo:

```text
src/
  discovery/
    core/
      types.ts
      run-discovery.ts
      normalize.ts
      dedupe.ts
    utils/
      rate-limit.ts
      http.ts
      html.ts
    sources/
      linkedin-guest.ts
      seek-browser.ts
      indeed-browser.ts
      jora-browser.ts
      registry.ts
    ats/
      detector.ts
      registry.ts
      greenhouse.ts
      lever.ts
    analysis/
      description-analysis.ts
      pr-detection.ts
      enrichment.ts
    fallback/
      company-site.ts
    storage/
      discovery-db.ts
      discovery-jobs-repo.ts
      discovery-runs-repo.ts
```

### Discovery sources

- `linkedin-guest.ts`
  - TS port of the Python guest search and job detail flow
  - uses plain HTTP
- `seek-browser.ts`
  - wrapper around current plugin Playwright-based seek scraping logic
- `indeed-browser.ts`
  - browser source scaffold until live parsing is implemented
- `jora-browser.ts`
  - browser source scaffold until live parsing is implemented

### ATS providers

- `detector.ts`
  - shared ATS URL detection and identifier extraction
- `greenhouse.ts`
  - TS port of Python Greenhouse API crawler
- `lever.ts`
  - TS port of Python Lever API crawler

### Shared analysis

Port the Python enrichment logic into TS rather than depending on the current plugin UI-scraper heuristics:

- salary normalization
- tech stack extraction
- experience level and years
- PR / security clearance detection
- career-page fallback logic

## Runtime Behavior

### Discovery entrypoint

The long-term discovery command/tool should run all enabled sources through one orchestration layer:

1. fetch search results from each selected source
2. fetch source detail pages if needed
3. normalize into the canonical job type
4. enrich fields from descriptions and source metadata
5. detect ATS from `externalUrl`
6. expand supported ATS jobs when available
7. optionally run career discovery fallback when enabled
8. store normalized jobs and export/search/report from the plugin

### Source execution model

Top-level discovery sources should run concurrently with a bounded default concurrency of `2`.

That allows:

- fast HTTP sources such as `linkedin` to run alongside slower Playwright sources such as `seek`
- one source failure to remain isolated from the others
- source-level logs and run tracking to stay attributable

ATS expansion should remain more conservative than top-level source execution, with an initial default concurrency target of `1`.

### Rate limiting

The TS port must keep the Python defaults and behavior:

- default min delay: `1.2`
- default max delay: `1.8`
- pages default: `30`
- random jitter between requests
- no aggressive retry policy
- continue on per-job and per-company failures

### LinkedIn apply URL extraction

The TS port must preserve the current extraction order:

1. `data-apply-url` / `data-applyurl`
2. apply-related anchor `href`
3. ATS-domain anchor `href`
4. raw HTML ATS URL scan
5. classify as `linkedin_easy_apply` or `unknown` if no external URL exists

The apply icon itself must never be treated as the external URL.

### Career discovery fallback

The fallback remains opt-in only:

- disabled by default
- only triggered with explicit flags/options
- bounded by a probe limit
- configurable path list
- rate-limited
- structured logging
- failure tolerant

## Storage Direction

The plugin already has SQLite storage, but the existing local-scraping schema is too narrow for the richer crawler output.

The rewrite should extend plugin storage to persist the normalized discovery schema rather than forcing the new crawler through the old browser-scrape shape.

Migration rule:

- evolve plugin storage in place
- keep migrations additive
- do not share SQLite with the Python project

## Testing And Parity Harness

The rewrite must be driven by parity tests before Python is retired.

### Fixture parity

Port the Python crawler tests and representative fixtures into the plugin repo for:

- LinkedIn search parsing
- LinkedIn detail parsing
- ATS detection
- Greenhouse normalization
- Lever normalization
- salary parsing
- experience-years extraction
- career discovery fallback

### Golden-output parity

Create a temporary comparison harness that runs:

- the Python reference implementation
- the TS rewrite

against saved inputs and diffs normalized JSON output.

### Live smoke parity

After fixture parity passes, compare live smoke outputs for:

- LinkedIn guest discovery
- ATS expansion counts
- salary-bearing jobs
- external URL counts
- posted-at completeness
- source breakdowns

Python remains the oracle until the TS version is close enough to replace it.

## Migration Phases

1. Create TS discovery scaffolding and canonical types.
2. Port HTTP/rate-limiter helpers from Python.
3. Port LinkedIn guest search parsing.
4. Port LinkedIn detail parsing and apply URL extraction.
5. Port ATS detector.
6. Port Greenhouse and Lever crawlers.
7. Port enrichment and salary logic.
8. Port career discovery fallback.
9. Integrate discovery into MCP tools and scheduler.
10. Run parity and smoke verification.
11. Retire Python only after parity is proven.

## Non-Goals For First Pass

- replacing the current SEEK Playwright logic
- redesigning MCP tool names
- simplifying schemas
- introducing browser scraping for LinkedIn guest flow
- supporting Workday or SmartRecruiters APIs directly
- deleting Python before the TS port is verified
