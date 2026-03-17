# Discovery Transport And Concurrency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the discovery engine run supported top-level sources concurrently with bounded concurrency, while preserving the agreed source transport policy: LinkedIn over direct HTTP and blocked boards over Playwright.

**Architecture:** Keep `src/discovery` as the canonical execution path. Add bounded source-level concurrency in `runDiscovery()`, keep ATS expansion lower-concurrency, and formalize source transport/status metadata so MCP tools and future docs expose one consistent model.

**Tech Stack:** TypeScript, Node.js, Playwright, Vitest, SQLite

---

### Task 1: Lock the source-policy contract in code-facing docs

**Files:**
- Modify: `docs/plans/2026-03-15-ts-discovery-rewrite-design.md`
- Modify: `docs/pending/2026-03-15-discovery-rewrite-parity-gaps.md`
- Test: none

**Step 1: Update the rewrite design doc**

Document that:

- `linkedin` is HTTP-first and supported
- `seek`/`indeed`/`jora` are browser-first
- browser LinkedIn is legacy-only
- source concurrency is bounded
- ATS expansion is lower-concurrency

**Step 2: Confirm the pending note matches the new policy**

Make sure the backlog explicitly says the browser LinkedIn scraper is transitional only.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-15-ts-discovery-rewrite-design.md docs/pending/2026-03-15-discovery-rewrite-parity-gaps.md
git commit -m "docs: lock discovery transport policy"
```

### Task 2: Write the failing concurrency test for source execution

**Files:**
- Modify: `tests/discovery/core/run-discovery.test.ts`
- Test: `tests/discovery/core/run-discovery.test.ts`

**Step 1: Write the failing test**

Add a test that uses two controlled source factories:

- one `linkedin` source
- one `seek` source

Each should block on a promise so the test can assert both sources have started before either one resolves.

The test should assert:

- both source runners start before the first one finishes
- successful results are merged from both
- source failure isolation still works when one source rejects

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/discovery/core/run-discovery.test.ts`

Expected: FAIL because `runDiscovery()` currently processes sources sequentially.

**Step 3: Commit**

```bash
git add tests/discovery/core/run-discovery.test.ts
git commit -m "test: cover concurrent source execution"
```

### Task 3: Implement bounded source concurrency in `runDiscovery`

**Files:**
- Modify: `src/discovery/core/run-discovery.ts`
- Test: `tests/discovery/core/run-discovery.test.ts`

**Step 1: Add minimal concurrency configuration**

Introduce a small internal helper for bounded async mapping or source-task scheduling.

Requirements:

- default top-level source concurrency: `2`
- keep current selected-source semantics
- preserve per-source logging and failure isolation
- keep output deterministic enough for tests

**Step 2: Keep ATS expansion conservative**

Do not make ATS expansion fully parallel in this task.

Acceptable first implementation:

- concurrent source execution
- ATS expansion remains inline/sequential within each source task

Or, if extracted:

- ATS expansion helper with explicit concurrency `1`

**Step 3: Run targeted tests**

Run: `npm test -- tests/discovery/core/run-discovery.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add src/discovery/core/run-discovery.ts tests/discovery/core/run-discovery.test.ts
git commit -m "feat: run discovery sources concurrently"
```

### Task 4: Make source metadata explicitly usable by tools and docs

**Files:**
- Modify: `src/discovery/sources/registry.ts`
- Modify: `tests/discovery/sources/registry.test.ts`
- Test: `tests/discovery/sources/registry.test.ts`

**Step 1: Write or expand the failing test**

Add assertions for:

- `linkedin` transport = `http`
- `seek` transport = `browser`
- `indeed` and `jora` remain `planned`
- any legacy exposure strategy is explicit rather than implicit

**Step 2: Implement the minimal registry updates**

If needed, add a `legacy` status or add helper functions that make supported-vs-planned-vs-legacy usage explicit for callers.

**Step 3: Run targeted tests**

Run: `npm test -- tests/discovery/sources/registry.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add src/discovery/sources/registry.ts tests/discovery/sources/registry.test.ts
git commit -m "refactor: clarify discovery source policy metadata"
```

### Task 5: Verify manual discovery and scheduler behavior under concurrent sources

**Files:**
- Modify: `tests/tools/local-scraping.test.ts`
- Modify: `tests/agent/scheduler.test.ts`
- Test: `tests/tools/local-scraping.test.ts`
- Test: `tests/agent/scheduler.test.ts`

**Step 1: Extend manual discovery coverage**

Add assertions that concurrent source execution still:

- creates one run
- stores merged jobs
- keeps per-source behavior visible in logs or summaries

**Step 2: Extend scheduler coverage**

Add assertions that scheduled discovery still:

- creates one run row
- survives one source failing while another succeeds

**Step 3: Run targeted tests**

Run:

- `npm test -- tests/tools/local-scraping.test.ts`
- `npm test -- tests/agent/scheduler.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add tests/tools/local-scraping.test.ts tests/agent/scheduler.test.ts
git commit -m "test: cover concurrent discovery orchestration"
```

### Task 6: Run full verification

**Files:**
- Modify: none
- Test: full suite

**Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS

**Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

**Step 3: Run build**

Run: `npm run build`

Expected: PASS

**Step 4: Commit**

```bash
git add .
git commit -m "feat: formalize concurrent discovery execution"
```
