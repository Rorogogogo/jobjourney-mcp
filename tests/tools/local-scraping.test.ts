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
      .prepare("SELECT COUNT(*) AS count FROM jobs WHERE url = ?")
      .get("https://www.linkedin.com/jobs/view/1") as { count: number };
    expect(stored.count).toBe(1);
    db.close();
  });

  it("registers schedule_discovery and get_latest_discovery_report", async () => {
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

    const scheduleTool = tools.get("schedule_discovery");
    expect(scheduleTool).toBeTruthy();
    const scheduleResult = await scheduleTool.execute({
      keyword: "full stack",
      location: "Sydney",
      time: "09:00",
      sources: ["linkedin", "seek"],
    });

    expect(scheduleResult).toContain("Scheduled discovery");
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
  });
});
