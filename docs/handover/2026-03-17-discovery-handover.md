# Discovery Rewrite Handover

**Date:** 2026-03-17

## Purpose

This document is the takeover summary for the JobJourney multi-source discovery rewrite and related local MCP scraping work.

The goal is to let a new engineer take over without reconstructing context from chat history.

## Repos Involved

### 1. Main Product Repo

Path:

`/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin`

This is now the primary product surface.

It contains:

- the MCP server
- the TS discovery engine
- the TS ATS crawlers
- the local SQLite storage
- the scheduler / agent
- the browser scrapers
- the parity harness

### 2. Python Reference Repo

Path:

`/Users/roro/Downloads/work/scrpaing_testing`

This is no longer the desired end-state product. It is still useful as:

- the behavior oracle for LinkedIn guest discovery
- the reference implementation for ATS crawling
- the Python side of the parity harness

Current recommendation:

- keep this repo as the reference oracle until TS parity is good enough
- do not build a permanent hybrid product around it

## Product Direction

The chosen direction is:

- one MCP/plugin product
- one TS codebase as the long-term destination
- two acquisition modes under the hood:
  - HTTP guest/API scraping for LinkedIn guest + ATS APIs
  - browser scraping for blocked sources like SEEK

This replaced the earlier idea of keeping Python as a permanent runtime.

## Current Discovery Architecture

### TS Discovery Core

Important files:

- [run-discovery.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/core/run-discovery.ts)
- [types.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/core/types.ts)

Responsibilities:

- source orchestration
- per-source failure isolation
- enrichment
- ATS detection
- ATS expansion
- optional company-site fallback
- logging hooks

### Discovery Sources

Important files:

- [linkedin-guest.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/sources/linkedin-guest.ts)
- [seek-browser.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/sources/seek-browser.ts)
- [registry.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/sources/registry.ts)

Current source status:

- `linkedin`: active, HTTP guest endpoint
- `seek`: active, browser/Playwright
- `indeed`: planned
- `jora`: planned

Important distinction:

- `discover_jobs` defaults to active discovery sources
- today that means `linkedin` and `seek`

### ATS

Important files:

- [detector.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/ats/detector.ts)
- [greenhouse.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/ats/greenhouse.ts)
- [lever.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/ats/lever.ts)

Implemented ATS support:

- Greenhouse
- Lever

Detected but not fully crawled:

- Workday
- SmartRecruiters
- Ashby

### Career Fallback

Important file:

- [company-site.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/fallback/company-site.ts)

Behavior:

- optional only
- bounded probing
- configurable career paths
- ATS detection from redirect target and page HTML

### Enrichment / Analysis

Important files:

- [enrichment.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/analysis/enrichment.ts)
- [description-analysis.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/analysis/description-analysis.ts)
- [pr-detection.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/analysis/pr-detection.ts)

Current enrichment includes:

- salary normalization
- work arrangement
- employment type
- experience level
- experience years
- tech stack
- PR / work-rights / clearance detection

## Key MCP Tools

Important file:

- [local-scraping.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/tools/local-scraping.ts)

Relevant tools:

- `discover_jobs`
- `search_jobs`
- `schedule_discovery`
- `get_latest_discovery_report`
- older Playwright path:
  - `scrape_jobs`
  - `schedule_scraping`

### Current Defaults

For `discover_jobs`:

- default `pages = 30`
- default `sources = active sources = linkedin, seek`

For LinkedIn parity/live smoke:

- default query: `full stack`
- default location: `Sydney`
- default pages: `1`
- default delay: `1.2` to `1.8`

## SQLite Storage

Path logic:

- [paths.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/config/paths.ts)
- [db.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/storage/sqlite/db.ts)

Default DB path:

`~/.jobjourney/jobs.db`

On this machine:

`/Users/roro/.jobjourney/jobs.db`

Tables:

- `jobs`
- `schedules`
- `scrape_runs`

Schema:

- [migrations.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/storage/sqlite/migrations.ts)

### What Jobs Store

`jobs` stores:

- source/platform-ish value in `source`
- `job_url`
- `external_url`
- `ats_type`
- `ats_identifier`
- `posted_at`
- `extracted_at`
- salary fields
- tech stack / experience / PR analysis fields
- `keyword`
- `search_location`
- `run_id`

### Batch / Run Tracking

`scrape_runs` stores:

- `keyword`
- `location`
- `source`
- `run_mode`
- `sources`
- `status`
- `started_at`
- `finished_at`
- `job_count`
- `error`

Important change:

one-off `discover_jobs` now creates and finishes `scrape_runs` rows and saves discovered jobs with `run_id`.

This fixes an earlier gap where manual discovery only wrote `jobs`, not batch metadata.

## Current Verified Behavior

### LinkedIn Guest Detail Fix

The TS port previously had a real bug:

- it only captured the first child heading of many description blocks
- examples were rows storing only values like `About Us` or `Who We Are`

Root cause:

- the TS guest parser used a regex that stopped at the first closing tag instead of matching the full description container

Fix:

- [linkedin-guest.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/sources/linkedin-guest.ts) now uses a container-aware extractor for nested description HTML
- guest salary extraction was also added there

Why this mattered:

- experience-years detection
- PR detection
- salary extraction

all depend on the description or detail fragment being complete enough

### Fresh Live Smoke After Description Fix

Recorded smoke report:

- [2026-03-16-full-stack-sydney-live-parity-smoke.json](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/docs/reports/2026-03-16-full-stack-sydney-live-parity-smoke.json)

Observed on a fresh `full stack` / `Sydney` LinkedIn smoke after the description fix:

- `10/10` LinkedIn rows had substantial descriptions
- `8/10` had `experience_years`
- `1/10` had `is_pr_required = 1`
- `3/10` had salary

Example extracted values from that run:

- `Protecht`:
  - `experience_years = 3`
  - `is_pr_required = 1`
- `Acorn`:
  - salary `$87k - $124k`
- `Freelancer.com`:
  - salary `Base pay range A$85,000.00/yr - A$100,000.00/yr`
- `MindFriend PRO`:
  - salary `Base pay range $70,000.00/yr - $200,000.00/yr`

### Remaining LinkedIn Live Nuance

LinkedIn guest external URL exposure is still unstable across sequential runs.

The recorded parity smoke still diverged on:

- `externalUrlCount`
- `atsBreakdown`
- `externalJobs`

Observed recorded difference:

- TS found `1` external URL
- Python found `3`

The current working assumption is:

- this is mostly LinkedIn guest response instability
- not a deterministic parser defect

## Parity Harness

Important files:

- [run-parity.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/parity/run-parity.ts)
- [cli.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/parity/cli.ts)
- [live-smoke.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/discovery/parity/live-smoke.ts)
- [python_parity_bridge.py](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/scripts/python_parity_bridge.py)

Current parity coverage:

- LinkedIn search parsing
- LinkedIn detail parsing
- ATS detection
- salary normalization
- recorded live LinkedIn smoke

Current recommendation:

- still treat Python as the behavior oracle when new edge cases appear

## SEEK Versus LinkedIn

Why SEEK often yields richer structured data:

- the SEEK source uses Playwright click-through
- it reads the full detail panel
- it gets dedicated selectors for salary and work type

Important file:

- [seek.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/scraper/sources/seek.ts)

LinkedIn guest is different:

- public guest HTML fragment
- lighter and faster
- but more volatile and sometimes less complete than a logged-in browser detail panel

## Testing Commands

### Plugin Repo

Path:

`/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin`

Commands:

```bash
npm test
npm run typecheck
npm run build
npm run parity:discovery
npm run parity:live-smoke
```

### Python Reference Repo

Path:

`/Users/roro/Downloads/work/scrpaing_testing`

Useful commands:

```bash
.venv/bin/python -m unittest tests/test_linkedin_job_detail.py
python3 -m compileall crawler tests
```

## MCP Testing

Recommended local MCP test path:

1. build the plugin
2. connect the local MCP server over stdio using `node dist/index.js`
3. call:
   - `discover_jobs`
   - `search_jobs`
   - `schedule_discovery`
   - `get_latest_discovery_report`

Hosted config exists in:

- [/.mcp.json](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/.mcp.json)

## Current Uncommitted State

At the time this handover doc was written, the plugin repo had uncommitted changes related to one-off discovery run tracking:

- [local-scraping.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/src/tools/local-scraping.ts)
- [local-scraping.test.ts](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/tests/tools/local-scraping.test.ts)
- [dist/tools/local-scraping.js](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/dist/tools/local-scraping.js)

These changes are verified by tests but may not be committed yet.

## Pending Work

### Highest-Value Remaining Gaps

1. Implement `Indeed` browser source.
2. Implement `Jora` browser source.
3. Expand parity fixtures as new LinkedIn / ATS edge cases appear.
4. Broaden live parity smoke coverage beyond one default query.

### Important Product / Data Modeling Gaps

1. `source` still carries overloaded meaning in some flows.
   - Long term, a cleaner split like `platform` plus `listing_kind` would be better.
   - This was discussed but not fully implemented.

2. Live parity smoke stores TS jobs to the main DB, but the Python side remains comparison-only.
   - This is intentional for now.

3. LinkedIn guest external URL exposure remains unstable.
   - Expect occasional TS-vs-Python differences even when parsers are healthy.

4. PR and experience detection are now much better, but still heuristic.
   - Continue to expand tests as new wording variants are found.

5. Salary extraction on LinkedIn guest is improved but not guaranteed.
   - It currently depends on the salary/insight text actually appearing in the guest detail HTML.

### Operational Gap To Recheck

The latest live DB at `/Users/roro/.jobjourney/jobs.db` may be empty depending on the most recent reset/test step.

That is not a product bug by itself. It simply means the DB is mutable and test reruns may have cleared it.

## Suggested Next Steps For A New Engineer

1. Read:
   - [2026-03-15-ts-discovery-rewrite-design.md](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/docs/plans/2026-03-15-ts-discovery-rewrite-design.md)
   - [2026-03-15-ts-discovery-rewrite-implementation.md](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/docs/plans/2026-03-15-ts-discovery-rewrite-implementation.md)
   - [2026-03-15-discovery-rewrite-parity-gaps.md](/Users/roro/Downloads/work/JJ/jobjourney-claude-plugin/docs/pending/2026-03-15-discovery-rewrite-parity-gaps.md)

2. Check current git status in the plugin repo.

3. Run:

```bash
cd /Users/roro/Downloads/work/JJ/jobjourney-claude-plugin
npm test
npm run typecheck
npm run build
```

4. If you need to validate live LinkedIn behavior:

```bash
npm run parity:live-smoke
```

5. If you need to validate manual MCP discovery batch tracking:

- run `discover_jobs`
- inspect `scrape_runs`
- inspect `jobs.run_id`

## Short State Summary

The TS rewrite is real, usable, and much closer to product-ready than the earlier mixed setup.

What is working well:

- LinkedIn guest discovery
- SEEK browser discovery
- ATS expansion for Greenhouse and Lever
- SQLite storage
- MCP exposure
- scheduling
- parity harness
- improved LinkedIn description extraction
- improved salary / experience / PR extraction on live LinkedIn detail text

What is still incomplete:

- Indeed
- Jora
- broader parity coverage
- cleaner long-term source/platform semantics
- more live-query coverage
