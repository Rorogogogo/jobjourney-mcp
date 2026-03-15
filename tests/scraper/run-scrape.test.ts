import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { createTmpHome } from "../helpers/tmp-home.js";
import { openDatabase } from "../../src/storage/sqlite/db.js";
import { JobsRepo } from "../../src/storage/sqlite/jobs-repo.js";
import { ScrapeRunsRepo } from "../../src/storage/sqlite/scrape-runs-repo.js";
import { renderMarkdownReport } from "../../src/scraper/core/markdown.js";
import { getAvailableSources } from "../../src/scraper/core/run-scrape.js";
import type {
  ScrapeRequest,
  ScrapedJob,
  JobSourceScraper,
} from "../../src/scraper/core/types.js";

// We test the pipeline logic without going through runScrape directly,
// to avoid needing to mock the scraper registry. Instead we replicate the pipeline steps.
describe("scrape pipeline", () => {
  let dbPath: string;

  beforeEach(() => {
    const home = createTmpHome();
    dbPath = path.join(home, ".jobjourney", "jobs.db");
  });

  it("creates a scrape run, saves jobs, and returns markdown", async () => {
    const mockJobs: ScrapedJob[] = [
      {
        title: "AI Engineer",
        company: "Canva",
        location: "Sydney",
        url: "https://seek.com.au/job/100",
        source: "seek",
        scrapedAt: new Date().toISOString(),
      },
      {
        title: "ML Engineer",
        company: "Atlassian",
        location: "Sydney",
        url: "https://seek.com.au/job/101",
        source: "seek",
        scrapedAt: new Date().toISOString(),
      },
    ];

    const db = openDatabase(dbPath);
    const jobsRepo = new JobsRepo(db);
    const runsRepo = new ScrapeRunsRepo(db);

    // Simulate pipeline
    const run = runsRepo.createRun({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
    });
    jobsRepo.upsertJobs(
      mockJobs.map((j) => ({
        ...j,
        runId: run.id,
        keyword: "AI Engineer",
        searchLocation: "Sydney",
      })),
    );
    const markdown = renderMarkdownReport(mockJobs);
    runsRepo.finishRun(run.id, { status: "success", jobCount: mockJobs.length });

    // Verify
    expect(run.id).toBeTruthy();
    expect(markdown).toContain("# Job Results");
    expect(markdown).toContain("AI Engineer");
    expect(jobsRepo.search({})).toHaveLength(2);

    db.close();
  });

  it("records error in scrape run on failure", () => {
    const db = openDatabase(dbPath);
    const runsRepo = new ScrapeRunsRepo(db);

    const run = runsRepo.createRun({
      keyword: "test",
      location: "test",
      source: "seek",
    });
    runsRepo.finishRun(run.id, { status: "error", error: "selectors changed" });

    // Verify run was recorded with error
    const rows = db.prepare("SELECT * FROM scrape_runs WHERE id = ?").all(run.id) as any[];
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toBe("selectors changed");

    db.close();
  });

  it("lists available sources", () => {
    expect(getAvailableSources()).toContain("seek");
  });
});
