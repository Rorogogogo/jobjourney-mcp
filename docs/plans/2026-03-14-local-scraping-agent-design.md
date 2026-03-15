# Local Scraping Agent Design

**Date:** 2026-03-14

**Status:** Approved for planning

## Goal

Add a local job scraping automation system to `jobjourney-claude-plugin` that can be controlled by AI agents through MCP tools while keeping all existing API-backed tools unchanged.

Users should be able to do both of these:

- Run a one-off local scrape with MCP.
- Schedule recurring local scraping that continues after the MCP process exits.

## Key Decisions

### Existing MCP tools stay unchanged

Current tools in [`src/tools/`](../../src/tools) remain backend/API-backed and keep their current behavior.

This feature is additive:

- keep existing tools
- add new local scraping tools
- never make existing tools silently run local scraping

### MCP is only the control plane

The MCP server is started by Claude Code or OpenClaw and can exit at any time. It must not own recurring job execution.

The MCP is responsible for:

- registering tools
- handling one-off manual scrapes
- storing schedules
- searching locally stored scraped jobs
- ensuring the background agent is running

### Background execution lives in a separate process

Create a separate long-running process named `jobjourney-agent`.

The agent is responsible for:

- loading schedules from SQLite
- registering recurring jobs with an embedded scheduler
- running Playwright scrapers
- storing results into SQLite
- writing heartbeat metadata so MCP can detect whether it is alive

This keeps scheduling cross-platform without relying on OS cron and without requiring the MCP process to stay alive.

## Architecture

### High-level flow

```text
Claude / OpenClaw
        |
        v
JobJourney MCP
        |
        +--> scrape_jobs() ------> Playwright scraper ------> SQLite ------> Markdown result
        |
        +--> schedule_scraping() -> SQLite schedules -> ensure agent running
                                               |
                                               v
                                        jobjourney-agent
                                               |
                                               v
                                         Playwright scraper
                                               |
                                               v
                                             SQLite
```

### Runtime split

#### MCP runtime

Entry point:

- [`src/index.ts`](../../src/index.ts)

Responsibilities:

- existing API tools
- new local scraping tools
- local job search
- schedule creation
- agent bootstrap / health check

#### Agent runtime

New entry point:

- `src/agent/index.ts`

Responsibilities:

- scheduler lifecycle
- schedule reconciliation
- scrape execution
- heartbeat updates

## Repo Layout

Keep the current repo and extend it instead of creating a separate project:

```text
jobjourney-claude-plugin/
  src/
    index.ts
    tools/
      local-scraping.ts
    agent/
      index.ts
      scheduler.ts
      heartbeat.ts
      process.ts
    scraper/
      core/
        run-scrape.ts
        markdown.ts
        types.ts
      sources/
        seek.ts
        linkedin.ts
    storage/
      sqlite/
        db.ts
        jobs-repo.ts
        schedules-repo.ts
        scrape-runs-repo.ts
        migrations.ts
    cli/
      run-schedule.ts
      scrape.ts
  docs/
    plans/
```

## Storage Design

SQLite database path:

- `~/.jobjourney/jobs.db`

Support files:

- `~/.jobjourney/agent-heartbeat.json`
- optionally `~/.jobjourney/logs/`

### Required tables

#### `jobs`

Required by spec, with local scraping as the only writer.

Columns:

- `id`
- `title`
- `company`
- `location`
- `url`
- `source`
- `description`
- `scraped_at`

Additional internal columns recommended:

- `run_id`
- `keyword`
- `search_location`

Constraint:

- unique `url`

#### `schedules`

Required by spec.

Columns:

- `id`
- `keyword`
- `location`
- `source`
- `cron`
- `created_at`

Additional internal columns recommended:

- `updated_at`
- `last_run_at`
- `enabled`

#### `scrape_runs`

Internal operational table needed for auditing and debugging recurring jobs.

Columns:

- `id`
- `schedule_id`
- `keyword`
- `location`
- `source`
- `status`
- `started_at`
- `finished_at`
- `job_count`
- `error`

## MCP Tool Design

### `scrape_jobs`

Inputs:

- `keyword`
- `location`
- `source` optional

Behavior:

- runs a one-off Playwright scrape immediately
- stores results in SQLite
- avoids duplicates using the unique `url`
- returns Markdown generated from the current scrape result

### `schedule_scraping`

Inputs:

- `keyword`
- `location`
- `time` or cron-compatible schedule input
- `source` optional

Behavior:

- converts the user-friendly time to cron
- writes schedule row to SQLite
- ensures `jobjourney-agent` is running
- returns confirmation text

### `search_jobs`

Inputs:

- `keyword` optional
- `location` optional
- `source` optional
- `limit` optional

Behavior:

- reads from local SQLite only
- returns matching jobs from the `jobs` table
- may optionally return Markdown or structured text

## Agent Design

### Scheduler ownership

Only `jobjourney-agent` owns recurring execution.

The MCP never schedules recurring tasks in memory.

### Agent startup

When `schedule_scraping()` is called:

1. write the schedule to SQLite
2. check the heartbeat file
3. if the heartbeat is missing or stale, spawn `jobjourney-agent`
4. return success to the MCP caller

### Agent runtime loop

On startup, the agent should:

1. initialize SQLite
2. load all enabled schedules
3. register them with `node-cron`
4. start a reconciliation interval to detect schedule changes
5. update heartbeat periodically

### Reconciliation

The agent should periodically re-read the schedules table so schedules created by MCP are picked up without restarting the agent.

## Scraper Design

### Reuse strategy

Do not reuse the browser extension runtime directly.

The extension code in [`../JJ-extension-3.0`](../../../JJ-extension-3.0) is useful as reference for:

- selectors
- field extraction rules
- pagination logic
- date parsing behavior
- normalization rules

But the new local scraper must be Playwright-based and independent of:

- `chrome.tabs`
- `chrome.windows`
- content-script messaging
- Chrome storage

### Source modules

Each source scraper should expose a common interface, for example:

```ts
type ScrapeRequest = {
  keyword: string;
  location: string;
  source: string;
};

type ScrapedJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description?: string;
  scrapedAt: string;
};

interface JobSourceScraper {
  scrape(request: ScrapeRequest): Promise<ScrapedJob[]>;
}
```

### Initial source scope

Start with the sources that are strongest in the extension:

- SEEK
- LinkedIn

Indeed should not be first because it is currently disabled in the extension configuration.

## Markdown Output

Every one-off scrape should produce Markdown like:

```md
# Job Results

## AI Engineer — Sydney

- Company: Canva
- Location: Sydney
- Link: https://...
- Source: Seek
```

Markdown should be generated from normalized job records, not raw DOM fragments.

## Cross-platform Strategy

This design stays cross-platform because:

- SQLite is local and cross-platform
- Playwright is cross-platform
- recurring scheduling uses `node-cron` inside the dedicated background agent
- the scheduler does not rely on macOS `launchd`, Linux `cron`, or Windows Task Scheduler

The one requirement is that `jobjourney-agent` must keep running after schedules are created.

## Error Handling

### MCP

- return actionable errors when the DB cannot be opened
- return actionable errors when the agent cannot be started
- return actionable errors when a scraper source is unsupported

### Agent

- record scrape failures in `scrape_runs`
- continue running if one schedule execution fails
- avoid duplicate scheduler registration during reconciliation

### Scraper

- tolerate empty result pages
- fail clearly if selectors break
- store partial success only if a job record has a valid unique URL

## Testing Strategy

### Unit tests

- SQLite bootstrap and schema creation
- schedule repository CRUD
- dedupe behavior on `jobs.url`
- heartbeat stale/alive detection
- cron expression conversion
- Markdown rendering

### Integration tests

- one-off scrape pipeline with mocked source scraper
- `schedule_scraping` persists data and triggers agent bootstrap
- `search_jobs` queries SQLite correctly
- agent reconciliation loads new schedules

### Playwright-focused tests

- parser tests for SEEK and LinkedIn using saved HTML fixtures where possible
- a small number of live smoke tests only if needed

## Rollout Order

1. SQLite layer
2. one source scraper
3. shared scrape pipeline
4. `scrape_jobs`
5. `jobjourney-agent`
6. `schedule_scraping`
7. `search_jobs`
8. second source scraper

## Non-goals

For v1, do not:

- change existing API-backed tool behavior
- merge local SQLite jobs into existing backend job tools
- depend on the browser extension at runtime
- require OS-specific schedulers
