# TS Discovery Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the current Python LinkedIn and ATS crawler into `jobjourney-claude-plugin` as a TypeScript-native discovery engine while preserving behavior, defaults, and output semantics before retiring Python.

**Architecture:** Build a new `src/discovery/` subsystem inside the plugin repo. Keep SEEK on the existing Playwright side, port LinkedIn guest and ATS logic to HTTP-based TypeScript modules, and verify parity with tests and smoke runs before wiring the new discovery engine into MCP tools and scheduler flows.

**Tech Stack:** TypeScript, Vitest, Node 18+, Playwright, SQLite via `better-sqlite3`

---

### Task 1: Create Discovery Core Scaffolding

**Files:**
- Create: `src/discovery/core/types.ts`
- Create: `src/discovery/core/run-discovery.ts`
- Create: `src/discovery/core/normalize.ts`
- Create: `src/discovery/sources/registry.ts`
- Create: `tests/discovery/core/types.test.ts`
- Create: `tests/discovery/sources/registry.test.ts`

**Step 1: Write the failing tests**

- add a type/shape test for the canonical discovery job object
- add a registry test that resolves `linkedin`, `seek`, `indeed`, and `jora`

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/core/types.test.ts tests/discovery/sources/registry.test.ts`

Expected: FAIL with missing modules.

**Step 3: Write minimal implementation**

- define the canonical discovery job/result types
- add a source registry interface with browser and HTTP source support
- expose a minimal `runDiscovery` signature without full behavior yet

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/core/types.test.ts tests/discovery/sources/registry.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/core src/discovery/sources tests/discovery
git commit -m "feat: add discovery engine scaffolding"
```

### Task 2: Port Shared Rate Limiting And HTTP Helpers

**Files:**
- Create: `src/discovery/utils/rate-limit.ts`
- Create: `src/discovery/utils/http.ts`
- Create: `tests/discovery/utils/rate-limit.test.ts`
- Create: `tests/discovery/utils/http.test.ts`

**Step 1: Write the failing tests**

- assert default delay range is `1.2` to `1.8`
- assert jittered delay stays within configured bounds
- assert the HTTP wrapper applies headers, timeouts, and throttling hooks

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/utils/rate-limit.test.ts tests/discovery/utils/http.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port the Python rate limiter semantics
- port the HTTP client wrapper semantics
- preserve header strategy and request pacing behavior

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/utils/rate-limit.test.ts tests/discovery/utils/http.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/utils tests/discovery/utils
git commit -m "feat: port discovery rate limit and http helpers"
```

### Task 3: Port LinkedIn Guest Search Parsing

**Files:**
- Create: `src/discovery/sources/linkedin-guest.ts`
- Create: `tests/discovery/sources/linkedin-guest-search.test.ts`
- Copy or create fixtures under: `tests/fixtures/linkedin-guest/`

**Step 1: Write the failing tests**

- search-card parsing must extract:
  - job id
  - title
  - company
  - location
  - job URL
  - posted-at from `<time datetime>`

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/sources/linkedin-guest-search.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port Python search-card parsing logic exactly
- keep pagination semantics based on `start`
- preserve source normalization semantics

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/sources/linkedin-guest-search.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/sources/linkedin-guest.ts tests/discovery/sources/linkedin-guest-search.test.ts tests/fixtures/linkedin-guest
git commit -m "feat: port linkedin guest search parsing"
```

### Task 4: Port LinkedIn Detail Parsing And Apply URL Extraction

**Files:**
- Modify: `src/discovery/sources/linkedin-guest.ts`
- Create: `tests/discovery/sources/linkedin-guest-detail.test.ts`

**Step 1: Write the failing tests**

- detail parsing must extract:
  - title
  - company
  - location
  - description
  - applicant count
  - external URL via the exact current extraction order
- missing external URL must classify as `linkedin_easy_apply` or `unknown`

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/sources/linkedin-guest-detail.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port Python detail parsing
- preserve the raw HTML ATS URL fallback
- preserve onsite/easy-apply classification

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/sources/linkedin-guest-detail.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/sources/linkedin-guest.ts tests/discovery/sources/linkedin-guest-detail.test.ts
git commit -m "feat: port linkedin guest detail parsing"
```

### Task 5: Port ATS Detection And Provider Registry

**Files:**
- Create: `src/discovery/ats/detector.ts`
- Create: `src/discovery/ats/registry.ts`
- Create: `tests/discovery/ats/detector.test.ts`
- Create: `tests/discovery/ats/registry.test.ts`

**Step 1: Write the failing tests**

- detect greenhouse, lever, workday, smartrecruiters, and ashby domains
- extract provider/company identifier exactly as the Python code does
- resolve supported providers from the registry

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/ats/detector.test.ts tests/discovery/ats/registry.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port the ATS domain mapping
- port identifier extraction rules
- add a provider registry for supported ATS crawlers

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/ats/detector.test.ts tests/discovery/ats/registry.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/ats tests/discovery/ats
git commit -m "feat: port ats detection and registry"
```

### Task 6: Port Greenhouse And Lever Crawlers

**Files:**
- Create: `src/discovery/ats/greenhouse.ts`
- Create: `src/discovery/ats/lever.ts`
- Create: `tests/discovery/ats/greenhouse.test.ts`
- Create: `tests/discovery/ats/lever.test.ts`

**Step 1: Write the failing tests**

- Greenhouse parsing must normalize HTML description content to plain text
- Lever parsing must normalize posting data into the canonical job type
- both crawlers must set `jobUrl`, `externalUrl`, `postedAt`, and `source` correctly

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/ats/greenhouse.test.ts tests/discovery/ats/lever.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port the Python Greenhouse crawler
- port the Python Lever crawler
- preserve source naming and field normalization behavior

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/ats/greenhouse.test.ts tests/discovery/ats/lever.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/ats/greenhouse.ts src/discovery/ats/lever.ts tests/discovery/ats
git commit -m "feat: port greenhouse and lever crawlers"
```

### Task 7: Port Enrichment Logic

**Files:**
- Create: `src/discovery/analysis/description-analysis.ts`
- Create: `src/discovery/analysis/pr-detection.ts`
- Create: `src/discovery/analysis/enrichment.ts`
- Create: `tests/discovery/analysis/description-analysis.test.ts`
- Create: `tests/discovery/analysis/pr-detection.test.ts`
- Create: `tests/discovery/analysis/salary-normalization.test.ts`

**Step 1: Write the failing tests**

- port Python coverage for:
  - tech stack extraction
  - experience level and years
  - PR and clearance detection
  - salary parsing across yearly, daily, and hourly formats

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/analysis/description-analysis.test.ts tests/discovery/analysis/pr-detection.test.ts tests/discovery/analysis/salary-normalization.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port the current Python enrichment logic exactly
- preserve JSON-list `techStack`
- preserve `isPrRequired` semantics
- preserve salary normalization fields

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/analysis/description-analysis.test.ts tests/discovery/analysis/pr-detection.test.ts tests/discovery/analysis/salary-normalization.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/analysis tests/discovery/analysis
git commit -m "feat: port discovery enrichment logic"
```

### Task 8: Port Career Discovery Fallback

**Files:**
- Create: `src/discovery/fallback/company-site.ts`
- Create: `tests/discovery/fallback/company-site.test.ts`

**Step 1: Write the failing tests**

- verify fallback remains disabled by default
- verify probe limit and configurable path list are respected
- verify fallback can detect supported ATS domains from company-site HTML
- verify `unknown`-only gating behavior

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/fallback/company-site.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- port Python company-site discovery logic
- preserve structured logging payload shape
- preserve failure-tolerant behavior

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/fallback/company-site.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/fallback tests/discovery/fallback
git commit -m "feat: port company-site fallback discovery"
```

### Task 9: Integrate Discovery Orchestration With Existing Plugin Sources

**Files:**
- Modify: `src/discovery/core/run-discovery.ts`
- Modify: `src/scraper/sources/seek.ts`
- Create or modify: `src/discovery/sources/seek-browser.ts`
- Create: `src/discovery/sources/indeed-browser.ts`
- Create: `src/discovery/sources/jora-browser.ts`
- Create: `tests/discovery/core/run-discovery.test.ts`

**Step 1: Write the failing tests**

- assert a mixed-source discovery run can combine:
  - LinkedIn HTTP results
  - SEEK browser results
  - soft-fail blocked sources without aborting the run

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/discovery/core/run-discovery.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- wire the source registry into `runDiscovery`
- adapt SEEK browser output into the canonical type
- scaffold Indeed and Jora browser sources with clean failure paths

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/discovery/core/run-discovery.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/core/run-discovery.ts src/discovery/sources src/scraper/sources/seek.ts tests/discovery/core/run-discovery.test.ts
git commit -m "feat: integrate multi-source discovery orchestration"
```

### Task 10: Evolve Plugin Storage For Discovery Jobs

**Files:**
- Modify: `src/storage/sqlite/migrations.ts`
- Modify: `src/storage/sqlite/db.ts`
- Modify: `src/storage/sqlite/jobs-repo.ts`
- Create if needed: `src/discovery/storage/discovery-jobs-repo.ts`
- Create: `tests/storage/sqlite/discovery-jobs-repo.test.ts`

**Step 1: Write the failing tests**

- assert the plugin SQLite schema can persist the canonical discovery job fields
- assert migrations are additive and old rows still load

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/storage/sqlite/discovery-jobs-repo.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- extend storage to support the normalized discovery schema
- keep migrations additive
- avoid breaking existing local-scraping rows

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/storage/sqlite/discovery-jobs-repo.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/storage/sqlite src/discovery/storage tests/storage/sqlite/discovery-jobs-repo.test.ts
git commit -m "feat: extend sqlite storage for discovery jobs"
```

### Task 11: Expose Discovery Through MCP Tools

**Files:**
- Modify: `src/tools/local-scraping.ts`
- Modify: `src/tools/scraping.ts`
- Modify: `src/index.ts`
- Create: `tests/tools/discovery.test.ts`

**Step 1: Write the failing tests**

- assert MCP tooling can trigger the new discovery engine
- assert source selection and default-source behavior are exposed correctly
- assert structured results can be returned instead of markdown-only scraping output

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/discovery.test.ts`

Expected: FAIL

**Step 3: Write minimal implementation**

- add discovery-oriented tool entrypoints
- keep existing behavior available until callers are migrated
- expose structured output suitable for reporting and scheduling

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/discovery.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/tools src/index.ts tests/tools/discovery.test.ts
git commit -m "feat: expose discovery engine through mcp tools"
```

### Task 12: Run Parity And Smoke Verification

**Files:**
- Create or update: `docs/pending/2026-03-15-discovery-rewrite-parity-gaps.md`
- Add any needed harness files under: `tests/discovery/parity/`

**Step 1: Add parity fixtures and comparison checks**

- capture representative Python inputs and expected outputs
- add TS fixture parity tests

**Step 2: Run full automated verification**

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

Run: `npm run build`

Expected: PASS

**Step 3: Run live smoke checks**

- one LinkedIn guest smoke run
- one Greenhouse smoke run
- one Lever smoke run
- one mixed-source run including SEEK if browser state is available

**Step 4: Record gaps**

- write any non-parity items to `docs/pending/2026-03-15-discovery-rewrite-parity-gaps.md`
- do not delete Python until the parity gap list is acceptable

**Step 5: Commit**

```bash
git add docs/pending tests/discovery/parity
git commit -m "docs: record discovery rewrite parity verification"
```
