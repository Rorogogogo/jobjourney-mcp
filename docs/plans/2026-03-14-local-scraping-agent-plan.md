# Local Scraping Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local scraping subsystem inside `jobjourney-claude-plugin` with SQLite-backed schedules, a separate `jobjourney-agent` background worker, Playwright scraping, and MCP tools for `scrape_jobs`, `schedule_scraping`, and `search_jobs` without changing existing API-backed tools.

**Architecture:** Keep the current MCP entrypoint as the control plane and add a second runtime, `jobjourney-agent`, as the background worker. Both runtimes share SQLite repositories and a single scrape pipeline so one-off scraping and scheduled scraping behave the same way.

**Tech Stack:** TypeScript, FastMCP, Playwright, SQLite via `better-sqlite3`, `node-cron`, Vitest

---

### Task 1: Add Local Tooling and Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/helpers/tmp-home.ts`

**Step 1: Write the failing test**

Create `tests/helpers/tmp-home.ts` usage test that asserts the test process can point code at a temporary home directory instead of the real `~/.jobjourney`.

```ts
import { describe, expect, it } from 'vitest';

describe('tmp home helper', () => {
  it('provides an isolated HOME for sqlite tests', () => {
    expect(process.env.HOME).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/helpers/tmp-home.ts`

Expected: fails because the test script and config do not exist yet.

**Step 3: Write minimal implementation**

- add `vitest`, `better-sqlite3`, `playwright`, and `node-cron` dependencies
- add scripts:
  - `test`
  - `agent`
  - `typecheck`
- create `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.ts'],
  },
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/helpers/tmp-home.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/helpers/tmp-home.ts
git commit -m "chore: add local scraping test harness"
```

### Task 2: Add Path and Environment Helpers

**Files:**
- Create: `src/config/paths.ts`
- Create: `tests/config/paths.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { getJobJourneyPaths } from '../../src/config/paths.js';

describe('getJobJourneyPaths', () => {
  it('resolves sqlite and heartbeat files under ~/.jobjourney', () => {
    const paths = getJobJourneyPaths('/tmp/test-home');
    expect(paths.dataDir).toBe('/tmp/test-home/.jobjourney');
    expect(paths.dbPath).toBe('/tmp/test-home/.jobjourney/jobs.db');
    expect(paths.heartbeatPath).toBe('/tmp/test-home/.jobjourney/agent-heartbeat.json');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/config/paths.test.ts`

Expected: FAIL with module not found.

**Step 3: Write minimal implementation**

```ts
import path from 'node:path';
import os from 'node:os';

export function getJobJourneyPaths(homeDir = os.homedir()) {
  const dataDir = path.join(homeDir, '.jobjourney');
  return {
    dataDir,
    dbPath: path.join(dataDir, 'jobs.db'),
    heartbeatPath: path.join(dataDir, 'agent-heartbeat.json'),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/config/paths.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/config/paths.ts tests/config/paths.test.ts
git commit -m "feat: add local jobjourney path helpers"
```

### Task 3: Build SQLite Bootstrap and Schema

**Files:**
- Create: `src/storage/sqlite/db.ts`
- Create: `src/storage/sqlite/migrations.ts`
- Create: `tests/storage/sqlite/db.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/sqlite/db.js';

describe('openDatabase', () => {
  it('creates jobs, schedules, and scrape_runs tables', () => {
    const db = openDatabase();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables.map((row: any) => row.name)).toEqual(
      expect.arrayContaining(['jobs', 'schedules', 'scrape_runs']),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/storage/sqlite/db.test.ts`

Expected: FAIL with module not found.

**Step 3: Write minimal implementation**

- create the data directory before opening SQLite
- use `better-sqlite3`
- run schema creation on open
- enforce unique `jobs.url`

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    description TEXT,
    scraped_at TEXT NOT NULL,
    run_id INTEGER
  );
`);
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/storage/sqlite/db.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/storage/sqlite/db.ts src/storage/sqlite/migrations.ts tests/storage/sqlite/db.test.ts
git commit -m "feat: add sqlite bootstrap for local scraping"
```

### Task 4: Add Repository Layer for Jobs, Schedules, and Runs

**Files:**
- Create: `src/storage/sqlite/jobs-repo.ts`
- Create: `src/storage/sqlite/schedules-repo.ts`
- Create: `src/storage/sqlite/scrape-runs-repo.ts`
- Create: `tests/storage/sqlite/jobs-repo.test.ts`
- Create: `tests/storage/sqlite/schedules-repo.test.ts`

**Step 1: Write the failing tests**

```ts
it('upserts jobs by unique url', () => {
  repo.upsertJobs([{ url: 'https://example.com/1', title: 'AI Engineer', company: 'Canva', location: 'Sydney', source: 'seek', scrapedAt: '2026-03-14T00:00:00.000Z' }]);
  repo.upsertJobs([{ url: 'https://example.com/1', title: 'AI Engineer', company: 'Canva', location: 'Sydney', source: 'seek', scrapedAt: '2026-03-14T01:00:00.000Z' }]);
  expect(repo.search({})).toHaveLength(1);
});

it('stores a schedule row with cron text', () => {
  const schedule = schedulesRepo.create({ keyword: 'AI Engineer', location: 'Sydney', source: 'seek', cron: '0 9 * * *' });
  expect(schedule.id).toBeTruthy();
});
```

**Step 2: Run test to verify they fail**

Run: `npm run test -- tests/storage/sqlite/jobs-repo.test.ts tests/storage/sqlite/schedules-repo.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- add repository methods:
  - `upsertJobs`
  - `searchJobs`
  - `createSchedule`
  - `listSchedules`
  - `createScrapeRun`
  - `finishScrapeRun`

```ts
INSERT INTO jobs (title, company, location, url, source, description, scraped_at, run_id)
VALUES (@title, @company, @location, @url, @source, @description, @scrapedAt, @runId)
ON CONFLICT(url) DO UPDATE SET
  title = excluded.title,
  company = excluded.company,
  location = excluded.location,
  source = excluded.source,
  description = excluded.description,
  scraped_at = excluded.scraped_at,
  run_id = excluded.run_id;
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/storage/sqlite/jobs-repo.test.ts tests/storage/sqlite/schedules-repo.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/storage/sqlite/jobs-repo.ts src/storage/sqlite/schedules-repo.ts src/storage/sqlite/scrape-runs-repo.ts tests/storage/sqlite/jobs-repo.test.ts tests/storage/sqlite/schedules-repo.test.ts
git commit -m "feat: add local scraping sqlite repositories"
```

### Task 5: Add Shared Scrape Types, Markdown Renderer, and Search Query Layer

**Files:**
- Create: `src/scraper/core/types.ts`
- Create: `src/scraper/core/markdown.ts`
- Create: `tests/scraper/markdown.test.ts`

**Step 1: Write the failing test**

```ts
import { renderMarkdownReport } from '../../src/scraper/core/markdown.js';

it('renders scraped jobs as markdown', () => {
  const markdown = renderMarkdownReport([
    {
      title: 'AI Engineer',
      company: 'Canva',
      location: 'Sydney',
      url: 'https://example.com/job',
      source: 'seek',
      scrapedAt: '2026-03-14T00:00:00.000Z',
    },
  ]);

  expect(markdown).toContain('# Job Results');
  expect(markdown).toContain('## AI Engineer');
  expect(markdown).toContain('- Company: Canva');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/scraper/markdown.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export function renderMarkdownReport(jobs: ScrapedJob[]) {
  const sections = jobs.map(job => [
    `## ${job.title} — ${job.location}`,
    '',
    `- Company: ${job.company}`,
    `- Location: ${job.location}`,
    `- Link: ${job.url}`,
    `- Source: ${job.source}`,
  ].join('\n'));

  return ['# Job Results', '', ...sections].join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/scraper/markdown.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/scraper/core/types.ts src/scraper/core/markdown.ts tests/scraper/markdown.test.ts
git commit -m "feat: add markdown reporting for local scraping"
```

### Task 6: Add the First Playwright Source Scraper

**Files:**
- Create: `src/scraper/sources/seek.ts`
- Create: `tests/scraper/sources/seek.test.ts`
- Reference: `../JJ-extension-3.0/pages/content/src/matches/jobsites/seek-scraper.ts`

**Step 1: Write the failing test**

Use an HTML fixture derived from the extension’s known SEEK selectors and assert that the scraper extracts title, company, location, URL, and description.

```ts
it('extracts jobs from seek html using known selectors', async () => {
  const jobs = await scrapeSeekPage(page, { keyword: 'AI Engineer', location: 'Sydney' });
  expect(jobs[0]).toMatchObject({
    title: 'AI Engineer',
    company: 'Canva',
    location: 'Sydney',
    source: 'seek',
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/scraper/sources/seek.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- build search URL generation for SEEK
- port selector logic from the extension
- return normalized `ScrapedJob[]`

```ts
const cards = await page.locator('[data-testid="job-card"]').all();
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/scraper/sources/seek.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/scraper/sources/seek.ts tests/scraper/sources/seek.test.ts
git commit -m "feat: add seek playwright scraper"
```

### Task 7: Build the Shared One-off Scrape Pipeline

**Files:**
- Create: `src/scraper/core/run-scrape.ts`
- Create: `tests/scraper/run-scrape.test.ts`

**Step 1: Write the failing test**

```ts
it('creates a scrape run, saves jobs, and returns markdown', async () => {
  const result = await runScrape({
    keyword: 'AI Engineer',
    location: 'Sydney',
    source: 'seek',
  });

  expect(result.jobs.length).toBeGreaterThan(0);
  expect(result.markdown).toContain('# Job Results');
  expect(result.runId).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/scraper/run-scrape.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- open browser
- call source scraper
- write `scrape_runs`
- upsert jobs
- render Markdown

```ts
const run = scrapeRunsRepo.createRun(request);
const jobs = await sourceScraper.scrape(request);
jobsRepo.upsertJobs(jobs.map(job => ({ ...job, runId: run.id })));
const markdown = renderMarkdownReport(jobs);
scrapeRunsRepo.finishRun(run.id, { status: 'success', jobCount: jobs.length });
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/scraper/run-scrape.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/scraper/core/run-scrape.ts tests/scraper/run-scrape.test.ts
git commit -m "feat: add shared local scrape pipeline"
```

### Task 8: Add MCP Tool Registration for `scrape_jobs` and `search_jobs`

**Files:**
- Create: `src/tools/local-scraping.ts`
- Modify: `src/index.ts`
- Create: `tests/tools/local-scraping.test.ts`

**Step 1: Write the failing test**

```ts
it('registers scrape_jobs and search_jobs tools', async () => {
  const tools = registerLocalScrapingTools(server);
  expect(tools).toContain('scrape_jobs');
  expect(tools).toContain('search_jobs');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/tools/local-scraping.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- register `scrape_jobs`
- register `search_jobs`
- keep all existing tools unchanged

```ts
server.addTool({
  name: 'search_jobs',
  parameters: z.object({
    keyword: z.string().optional(),
    location: z.string().optional(),
    source: z.string().optional(),
  }),
  execute: async args => formatSearchResults(jobsRepo.searchJobs(args)),
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/tools/local-scraping.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/local-scraping.ts src/index.ts tests/tools/local-scraping.test.ts
git commit -m "feat: add local scraping mcp tools"
```

### Task 9: Add Heartbeat and Agent Process Management

**Files:**
- Create: `src/agent/heartbeat.ts`
- Create: `src/agent/process.ts`
- Create: `tests/agent/process.test.ts`

**Step 1: Write the failing test**

```ts
it('reports a stale heartbeat as not running', () => {
  writeHeartbeat({ updatedAt: '2026-03-14T00:00:00.000Z' });
  expect(isAgentHealthy({ now: '2026-03-14T01:00:00.000Z', maxAgeMs: 30_000 })).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/agent/process.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- heartbeat file writer and reader
- stale detection
- detached spawn helper using `process.execPath` and the built `dist/agent/index.js`

```ts
spawn(process.execPath, [agentEntryPath], {
  detached: true,
  stdio: 'ignore',
}).unref();
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/agent/process.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/heartbeat.ts src/agent/process.ts tests/agent/process.test.ts
git commit -m "feat: add agent heartbeat and bootstrap helpers"
```

### Task 10: Build `jobjourney-agent` and Scheduler Reconciliation

**Files:**
- Create: `src/agent/index.ts`
- Create: `src/agent/scheduler.ts`
- Create: `tests/agent/scheduler.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
it('loads schedules from sqlite and registers cron jobs once', async () => {
  const scheduler = new AgentScheduler(repos, fakeCron);
  await scheduler.reconcile();
  expect(fakeCron.registered).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/agent/scheduler.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- add `jobjourney-agent` bin entry
- load schedules from repo
- register with `node-cron`
- periodically reconcile
- update heartbeat on interval

```ts
cron.schedule(schedule.cron, () => runScheduledScrape(schedule.id));
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/agent/scheduler.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/index.ts src/agent/scheduler.ts package.json package-lock.json tests/agent/scheduler.test.ts
git commit -m "feat: add jobjourney background agent"
```

### Task 11: Add `schedule_scraping` MCP Tool

**Files:**
- Modify: `src/tools/local-scraping.ts`
- Create: `tests/tools/schedule-scraping.test.ts`

**Step 1: Write the failing test**

```ts
it('stores a schedule and ensures the agent is running', async () => {
  const result = await scheduleScraping({
    keyword: 'AI Engineer',
    location: 'Sydney',
    time: '09:00',
    source: 'seek',
  });

  expect(result).toContain('09:00');
  expect(schedulesRepo.listSchedules()).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/tools/schedule-scraping.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- convert `HH:mm` to cron text
- insert schedule row
- call `ensureAgentRunning()`
- return a clear confirmation string

```ts
const cron = `0 ${hour} * * *`;
await schedulesRepo.create({ keyword, location, source, cron });
await ensureAgentRunning();
return `Scheduled ${keyword} in ${location} every day at ${time}.`;
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/tools/schedule-scraping.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/local-scraping.ts tests/tools/schedule-scraping.test.ts
git commit -m "feat: add schedule scraping mcp tool"
```

### Task 12: Add LinkedIn as the Second Source and Final Verification

**Files:**
- Create: `src/scraper/sources/linkedin.ts`
- Create: `tests/scraper/sources/linkedin.test.ts`
- Reference: `../JJ-extension-3.0/pages/content/src/matches/jobsites/linkedin-scraper.ts`
- Modify: `README.md`

**Step 1: Write the failing test**

```ts
it('extracts linkedin job cards into normalized jobs', async () => {
  const jobs = await scrapeLinkedInPage(page, { keyword: 'AI Engineer', location: 'Sydney' });
  expect(jobs[0].source).toBe('linkedin');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/scraper/sources/linkedin.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port the proven LinkedIn selectors and field parsing from the extension
- register the source in the scraper factory
- update README with local scraping setup and agent behavior

**Step 4: Run full verification**

Run:

```bash
npm run build
npm run test
```

Expected:

- `build` exits 0
- `test` exits 0

**Step 5: Commit**

```bash
git add src/scraper/sources/linkedin.ts tests/scraper/sources/linkedin.test.ts README.md
git commit -m "feat: add linkedin local scraper and docs"
```

Plan complete and saved to `docs/plans/2026-03-14-local-scraping-agent-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
