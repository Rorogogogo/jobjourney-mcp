# Discovery Transport And Concurrency Design

**Date:** 2026-03-17

**Status:** Approved for planning

## Goal

Lock the long-term source transport policy and source execution model for the TypeScript discovery engine so the product has one clear scraping architecture instead of drifting between HTTP and browser approaches.

## Transport Policy

### LinkedIn uses direct HTTP scraping

`linkedin` is the only source that should use direct HTTP scraping as the supported product path.

That path is:

- LinkedIn guest search endpoint
- LinkedIn guest job detail endpoint
- apply URL extraction from the returned HTML fragment
- ATS detection
- ATS API expansion

Reasoning:

- the guest endpoints are materially faster and more stable than browser UI scraping
- they support large discovery runs without browser overhead
- they align with the current parity-tested TS and Python reference logic

### SEEK, Jora, and Indeed use Playwright

Blocked job boards should use browser automation as their supported product path:

- `seek` -> Playwright
- `jora` -> Playwright
- `indeed` -> Playwright

Reasoning:

- these platforms are blocked or degraded under plain HTTP requests
- the browser path can reuse login/cookies and anti-bot-resistant execution
- the plugin already owns the local Playwright runtime and scheduling UX

### Browser LinkedIn scraper becomes legacy-only

The older browser-based LinkedIn scraper in `src/scraper` should not remain a supported product path.

It may remain temporarily as:

- an internal debugging reference
- a transition fallback during consolidation

It must not remain:

- an active source in MCP defaults
- a scheduler path
- a second official LinkedIn implementation

Removal condition:

- remove it after `linkedin-guest` has stable fixture parity, stable live smoke parity, and no required fields still depend on the browser path

## Canonical Source Model

`src/discovery` is the only canonical discovery architecture.

Source modules should live under `src/discovery/sources` and declare:

- source name
- transport type (`http` or `browser`)
- status (`active`, `planned`, or a later `legacy` state if needed)

Current intended policy:

- `linkedin` -> `http`, `active`
- `seek` -> `browser`, `active`
- `indeed` -> `browser`, `planned`
- `jora` -> `browser`, `planned`

`src/scraper` should be treated as temporary legacy code. Any remaining reusable pieces should be moved into shared browser/session helpers or wrapped by `src/discovery`.

## Concurrency Policy

### Top-level discovery sources may run concurrently

Top-level source execution should be concurrent with a bounded default concurrency of `2`.

This means:

- `linkedin` and `seek` may run at the same time
- future `jora` or `indeed` runs may share the same source pool, still capped
- each source remains internally responsible for its own throttling and browser/session safety

Reasoning:

- reduces wall-clock runtime for mixed-source discovery
- avoids forcing fast HTTP sources to wait on slower Playwright sources
- keeps concurrency bounded so the system stays observable and resource-safe

### ATS expansion stays more conservative

ATS/company expansion should remain lower-concurrency than top-level source execution.

Recommended default:

- source concurrency: `2`
- ATS expansion concurrency: `1`

This keeps:

- LinkedIn request pressure bounded
- Playwright memory/CPU bounded
- ATS crawl fan-out manageable
- logs and run tracking easier to interpret

### Failure isolation

Concurrency must preserve the current failure contract:

- one source failing does not fail the whole run
- one ATS expansion failing does not fail the whole run
- run tracking still records source-level success/failure clearly

## Logging And Run Tracking

Concurrent execution must preserve structured, attributable logs:

- `discovery_source_start`
- `discovery_source_success`
- `discovery_source_error`
- `discovery_ats_expand_start`
- `discovery_ats_expand_success`
- `discovery_run_complete`

All events should continue to carry enough context to disambiguate concurrent activity:

- `source`
- `keyword`
- `location`
- `atsType`
- `companyIdentifier`
- counts and error text

SQLite run tracking should remain one run per user-triggered discovery, with source-level outcomes summarized inside that run rather than creating separate top-level runs per source.

## Product Behavior Summary

When a user triggers discovery:

1. the system starts one discovery run
2. active selected sources run concurrently, up to the configured source concurrency limit
3. `linkedin` uses HTTP guest scraping
4. `seek` uses Playwright
5. future `indeed` and `jora` use Playwright
6. ATS expansion runs in a more conservative secondary stage
7. results are merged into the canonical job model and stored in SQLite

This is the agreed long-term architecture.

