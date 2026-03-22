import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/storage/sqlite/db.js";
import { createTmpHome } from "../helpers/tmp-home.js";
import { registerLocalScrapingTools } from "../../src/tools/local-scraping.js";
import { createEmptyDiscoveryJob } from "../../src/discovery/core/types.js";

describe("registerLocalScrapingTools", () => {
  it("is a function that accepts a server", () => {
    expect(typeof registerLocalScrapingTools).toBe("function");
  });

  it("registers discover_jobs and persists discovery results", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };
    const home = createTmpHome();
    const dbPath = path.join(home, ".jobjourney", "jobs.db");
    const discoveryJob = createEmptyDiscoveryJob({
      id: "li-1",
      source: "linkedin",
      title: "Senior Full Stack Engineer",
      company: "Example",
      location: "Sydney",
      description: "Hybrid full-time role with Python and React.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      extractedAt: "2026-03-15T00:00:00Z",
    });
    discoveryJob.externalUrl = "https://boards.greenhouse.io/example/jobs/1";
    discoveryJob.atsType = "greenhouse";
    discoveryJob.atsIdentifier = "example";

    registerLocalScrapingTools(server as any, {
      openDatabase: () => openDatabase(dbPath),
      ensureAgentRunning: () => {},
      runDiscovery: vi.fn(async () => ({
        jobs: [discoveryJob],
        sources: ["linkedin"],
        failedSources: [],
        expandedCompanies: ["greenhouse:example"],
      })),
    });

    const tool = tools.get("discover_jobs");
    expect(tool).toBeTruthy();

    const result = await tool.execute({
      keyword: "full stack",
      location: "Sydney",
      sources: ["linkedin"],
      pages: 2,
    });

    const parsed = JSON.parse(result);
    expect(parsed).toMatchObject({
      totalJobs: 1,
      successfulSources: ["linkedin"],
      failedSources: [],
      expandedCompanies: ["greenhouse:example"],
    });

    const db = openDatabase(dbPath);
    const stored = db
      .prepare("SELECT COUNT(*) AS count, MAX(run_id) AS run_id FROM jobs WHERE url = ?")
      .get("https://www.linkedin.com/jobs/view/1") as { count: number; run_id: number | null };
    expect(stored.count).toBe(1);
    expect(stored.run_id).toBeTypeOf("number");

    const run = db
      .prepare(
        `SELECT keyword, location, source, run_mode, sources, status, job_count, error
         FROM scrape_runs
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as {
      keyword: string;
      location: string;
      source: string;
      run_mode: string;
      sources: string | null;
      status: string;
      job_count: number | null;
      error: string | null;
    };
    expect(run).toMatchObject({
      keyword: "full stack",
      location: "Sydney",
      source: "discover",
      run_mode: "discover",
      sources: "linkedin",
      status: "success",
      job_count: 1,
      error: null,
    });
    db.close();
  });

  it("starts the background agent before returning one-off discovery results", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };
    const home = createTmpHome();
    const dbPath = path.join(home, ".jobjourney", "jobs.db");
    const ensureAgentRunning = vi.fn(() => true);

    registerLocalScrapingTools(server as any, {
      openDatabase: () => openDatabase(dbPath),
      ensureAgentRunning,
      runDiscovery: vi.fn(async () => ({
        jobs: [],
        sources: ["linkedin"],
        failedSources: [],
        expandedCompanies: [],
      })),
    });

    const tool = tools.get("discover_jobs");
    expect(tool).toBeTruthy();

    await tool.execute({
      keyword: "full stack",
      location: "Sydney",
      sources: ["linkedin"],
      pages: 1,
    });

    expect(ensureAgentRunning).toHaveBeenCalledTimes(1);
  });

  it("keeps discovery progress logs off stdout for MCP stdio safety", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };
    const home = createTmpHome();
    const dbPath = path.join(home, ".jobjourney", "jobs.db");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerLocalScrapingTools(server as any, {
      openDatabase: () => openDatabase(dbPath),
      ensureAgentRunning: () => {},
      runDiscovery: vi.fn(async (_options, deps) => {
        deps?.logger?.({ event: "discovery_source_start", source: "linkedin" });
        return {
          jobs: [],
          sources: ["linkedin"],
          failedSources: [],
          expandedCompanies: [],
        };
      }),
    });

    try {
      const tool = tools.get("discover_jobs");
      await tool.execute({
        keyword: "full stack",
        location: "Sydney",
        sources: ["linkedin"],
        pages: 1,
      });

      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[discover]"),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[discover]"),
      );
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("records failed discover_jobs runs in scrape_runs", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };
    const home = createTmpHome();
    const dbPath = path.join(home, ".jobjourney", "jobs.db");

    registerLocalScrapingTools(server as any, {
      openDatabase: () => openDatabase(dbPath),
      ensureAgentRunning: () => {},
      runDiscovery: vi.fn(async () => {
        throw new Error("LinkedIn guest endpoint failed");
      }),
    });

    const tool = tools.get("discover_jobs");
    await expect(
      tool.execute({
        keyword: "full stack",
        location: "Sydney",
        sources: ["linkedin"],
        pages: 2,
      }),
    ).rejects.toThrow("LinkedIn guest endpoint failed");

    const db = openDatabase(dbPath);
    const run = db
      .prepare(
        `SELECT keyword, location, source, run_mode, sources, status, job_count, error
         FROM scrape_runs
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as {
      keyword: string;
      location: string;
      source: string;
      run_mode: string;
      sources: string | null;
      status: string;
      job_count: number | null;
      error: string | null;
    };
    expect(run).toMatchObject({
      keyword: "full stack",
      location: "Sydney",
      source: "discover",
      run_mode: "discover",
      sources: "linkedin",
      status: "error",
      job_count: null,
      error: "LinkedIn guest endpoint failed",
    });

    const jobsCount = db.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number };
    expect(jobsCount.count).toBe(0);
    db.close();
  });

  it("registers schedule_jobs and get_latest_discovery_report", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };
    const home = createTmpHome();
    const dbPath = path.join(home, ".jobjourney", "jobs.db");

    registerLocalScrapingTools(server as any, {
      openDatabase: () => openDatabase(dbPath),
      ensureAgentRunning: () => true,
      getActiveDiscoverySourceNames: () => ["linkedin", "seek"],
    });

    const scheduleTool = tools.get("schedule_jobs");
    expect(scheduleTool).toBeTruthy();
    const scheduleResult = await scheduleTool.execute({
      keyword: "full stack",
      location: "Sydney",
      time: "09:00",
      sources: ["linkedin", "seek"],
    });

    expect(scheduleResult).toContain("Scheduled");
    expect(scheduleResult).toContain("linkedin, seek");

    const db = openDatabase(dbPath);
    db.prepare(
      `INSERT INTO scrape_runs (keyword, location, source, run_mode, sources, status, started_at, finished_at, job_count)
       VALUES (?, ?, ?, ?, ?, 'success', datetime('now'), datetime('now'), 2)`,
    ).run("full stack", "Sydney", "discover", "discover", "linkedin,seek");
    const run = db.prepare("SELECT id FROM scrape_runs ORDER BY id DESC LIMIT 1").get() as {
      id: number;
    };
    db.prepare(
      `INSERT INTO jobs (
         title, company, location, url, job_url, external_url, source, ats_type, ats_identifier,
         description, salary, posted_date, posted_at, job_type, workplace_type, work_arrangement,
         company_logo_url, applicant_count, is_already_applied, applied_date_utc,
         scraped_at, extracted_at, salary_raw, salary_min, salary_max, salary_currency, salary_period,
         required_skills, tech_stack, experience_level, experience_years, is_pr_required,
         security_clearance, pr_confidence, pr_reasoning, run_id, keyword, search_location
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
    ).run(
      "Senior Full Stack Engineer",
      "Example",
      "Sydney",
      "https://www.linkedin.com/jobs/view/1",
      "https://www.linkedin.com/jobs/view/1",
      "https://boards.greenhouse.io/example/jobs/1",
      "linkedin",
      "greenhouse",
      "example",
      "Hybrid role with Python and React.",
      "$120,000",
      null,
      "2026-03-10",
      "full-time",
      "hybrid",
      "hybrid",
      "",
      "40 applicants",
      0,
      "",
      "2026-03-15T00:00:00Z",
      "2026-03-15T00:00:00Z",
      "$120,000",
      "120000",
      "120000",
      "$",
      "year",
      "Python, React",
      "[\"Python\",\"React\"]",
      "senior",
      5,
      0,
      "",
      "medium",
      "No clear PR requirement indicators found",
      run.id,
      "full stack",
      "Sydney",
    );
    db.close();

    const reportTool = tools.get("get_latest_discovery_report");
    expect(reportTool).toBeTruthy();
    const report = await reportTool.execute({});

    expect(report).toContain("Latest Discovery Run");
    expect(report).toContain("Senior Full Stack Engineer");
    expect(report).toContain("linkedin, seek");
    expect(report).toContain("Job URL:");
    expect(report).toContain("External URL:");
  });

  it("registers setup_local_scraping and reports local readiness", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };
    const home = createTmpHome();
    const dbPath = path.join(home, ".jobjourney", "jobs.db");

    registerLocalScrapingTools(server as any, {
      openDatabase: () => openDatabase(dbPath),
      ensureAgentRunning: () => true,
      hasCookies: (site: string) => site === "linkedin",
      checkPlaywrightReady: vi.fn(async () => ({
        ready: false,
        details: "Chromium is not installed.",
      })),
    });

    const tool = tools.get("setup_local_scraping");
    expect(tool).toBeTruthy();

    const result = await tool.execute({});

    expect(result).toContain("# Local Scraping Setup");
    expect(result).toContain("- Database: ready (");
    expect(result).toContain(".jobjourney/jobs.db");
    expect(result).toContain("- Agent: started");
    expect(result).toContain("- Playwright: not ready");
    expect(result).toContain("Chromium is not installed.");
    expect(result).toContain("- seek: login required");
    expect(result).toContain("- linkedin: login saved (optional for guest discovery)");
    expect(result).toContain("npx playwright install chromium");
    expect(result).toContain('Use login_jobsite with site "seek"');
    expect(result).toContain('Use discover_jobs with keyword "full stack", location "Sydney", sources ["linkedin", "seek"], pages 1');
  });

  it("registers check_for_updates and reports when a newer version is available", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };

    registerLocalScrapingTools(server as any, {
      checkForUpdates: vi.fn(async () => ({
        currentVersion: "3.1.0",
        latestVersion: "3.2.0",
        updateAvailable: true,
        error: "",
      })),
    });

    const tool = tools.get("check_for_updates");
    expect(tool).toBeTruthy();

    const result = await tool.execute({});

    expect(result).toContain("# Plugin Update Status");
    expect(result).toContain("- Current version: 3.1.0");
    expect(result).toContain("- Latest version: 3.2.0");
    expect(result).toContain("- Update available: yes");
    expect(result).toContain("claude mcp remove jobjourney");
    expect(result).toContain("npx -y jobjourney-claude-plugin");
  });

  it("registers check_for_updates and degrades cleanly when the lookup fails", async () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };

    registerLocalScrapingTools(server as any, {
      checkForUpdates: vi.fn(async () => ({
        currentVersion: "3.1.0",
        latestVersion: "",
        updateAvailable: false,
        error: "Registry lookup failed",
      })),
    });

    const tool = tools.get("check_for_updates");
    const result = await tool.execute({});

    expect(result).toContain("# Plugin Update Status");
    expect(result).toContain("- Current version: 3.1.0");
    expect(result).toContain("- Latest version: unavailable");
    expect(result).toContain("- Update available: unknown");
    expect(result).toContain("- Check status: Registry lookup failed");
  });
});
