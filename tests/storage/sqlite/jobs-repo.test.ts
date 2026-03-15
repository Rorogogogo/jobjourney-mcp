import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../../src/storage/sqlite/db.js";
import { JobsRepo } from "../../../src/storage/sqlite/jobs-repo.js";
import { createTmpHome } from "../../helpers/tmp-home.js";

describe("JobsRepo", () => {
  let repo: JobsRepo;

  beforeEach(() => {
    const home = createTmpHome();
    const db = openDatabase(path.join(home, ".jobjourney", "jobs.db"));
    repo = new JobsRepo(db);
  });

  it("upserts jobs by unique url", () => {
    repo.upsertJobs([
      {
        url: "https://example.com/1",
        title: "AI Engineer",
        company: "Canva",
        location: "Sydney",
        source: "seek",
        scrapedAt: "2026-03-14T00:00:00.000Z",
      },
    ]);
    repo.upsertJobs([
      {
        url: "https://example.com/1",
        title: "AI Engineer Updated",
        company: "Canva",
        location: "Sydney",
        source: "seek",
        scrapedAt: "2026-03-14T01:00:00.000Z",
      },
    ]);

    const results = repo.search({});

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("AI Engineer Updated");
  });

  it("searches by keyword", () => {
    repo.upsertJobs([
      {
        url: "https://example.com/1",
        title: "AI Engineer",
        company: "Canva",
        location: "Sydney",
        source: "seek",
        scrapedAt: "2026-03-14T00:00:00.000Z",
      },
      {
        url: "https://example.com/2",
        title: "Product Manager",
        company: "Google",
        location: "Melbourne",
        source: "seek",
        scrapedAt: "2026-03-14T00:00:00.000Z",
      },
    ]);

    const results = repo.search({ keyword: "AI" });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("AI Engineer");
  });
});
