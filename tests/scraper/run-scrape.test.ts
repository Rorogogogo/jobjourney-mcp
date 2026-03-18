import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { createTmpHome } from "../helpers/tmp-home.js";
import { openDatabase } from "../../src/storage/sqlite/db.js";
import { ScrapeRunsRepo } from "../../src/storage/sqlite/scrape-runs-repo.js";
import { getAvailableSources, runScrape } from "../../src/scraper/core/run-scrape.js";
import { createEmptyDiscoveryJob } from "../../src/discovery/core/types.js";

describe("scrape pipeline", () => {
  let dbPath: string;

  beforeEach(() => {
    const home = createTmpHome();
    dbPath = path.join(home, ".jobjourney", "jobs.db");
  });

  it("creates a scrape run, saves primary source jobs, and returns markdown", async () => {
    const extractedAt = "2026-03-17T00:00:00Z";
    const primaryJob = createEmptyDiscoveryJob({
      id: "seek-100",
      source: "seek",
      title: "AI Engineer",
      company: "Canva",
      location: "Sydney",
      description: "Build ML products.",
      jobUrl: "https://www.seek.com.au/job/100",
      postedAt: "2026-03-10",
      extractedAt,
    });
    const expandedJob = createEmptyDiscoveryJob({
      id: "lever-1",
      source: "seek",
      title: "Backend Engineer",
      company: "Canva",
      location: "Sydney",
      description: "ATS-expanded role.",
      jobUrl: "https://jobs.lever.co/canva/abc",
      extractedAt,
    });
    expandedJob.externalUrl = "https://jobs.lever.co/canva/abc/apply";
    expandedJob.atsType = "lever";
    expandedJob.atsIdentifier = "canva";

    const result = await runScrape(
      {
        keyword: "AI Engineer",
        location: "Sydney",
        source: "seek",
        dbPath,
        maxPages: 2,
      },
      {
        runDiscovery: vi.fn(async () => ({
          jobs: [primaryJob, expandedJob],
          sources: ["seek"],
          failedSources: [],
          expandedCompanies: ["lever:canva"],
        })),
      },
    );

    expect(result.runId).toBeTruthy();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      title: "AI Engineer",
      source: "seek",
      url: "https://www.seek.com.au/job/100",
    });
    expect(result.markdown).toContain("# Job Results");
    expect(result.markdown).toContain("AI Engineer");
    expect(result.markdown).not.toContain("Backend Engineer");

    const db = openDatabase(dbPath);
    const storedJobs = db.prepare("SELECT title, url, run_id FROM jobs ORDER BY id ASC").all() as Array<{
      title: string;
      url: string;
      run_id: number | null;
    }>;
    expect(storedJobs).toEqual([
      {
        title: "AI Engineer",
        url: "https://www.seek.com.au/job/100",
        run_id: result.runId,
      },
    ]);

    const run = db.prepare("SELECT status, job_count, error FROM scrape_runs WHERE id = ?").get(
      result.runId,
    ) as { status: string; job_count: number | null; error: string | null };
    expect(run).toEqual({
      status: "success",
      job_count: 1,
      error: null,
    });
    db.close();
  });

  it("records error in scrape run on failure", async () => {
    await expect(
      runScrape(
        {
          keyword: "test",
          location: "test",
          source: "seek",
          dbPath,
        },
        {
          runDiscovery: vi.fn(async () => {
            throw new Error("selectors changed");
          }),
        },
      ),
    ).rejects.toThrow("selectors changed");

    const db = openDatabase(dbPath);
    const rows = db.prepare("SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 1").all() as any[];
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toBe("selectors changed");
    db.close();
  });

  it("lists available sources", () => {
    expect(getAvailableSources()).toContain("seek");
    expect(getAvailableSources()).toContain("linkedin");
    expect(getAvailableSources()).not.toContain("indeed");
  });
});
