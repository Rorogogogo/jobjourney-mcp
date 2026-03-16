import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDiscoveryJob } from "../../../src/discovery/core/types.js";
import { DiscoveryJobsRepo } from "../../../src/discovery/storage/discovery-jobs-repo.js";
import { openDatabase } from "../../../src/storage/sqlite/db.js";
import { createTmpHome } from "../../helpers/tmp-home.js";

describe("DiscoveryJobsRepo", () => {
  let dbPath: string;

  beforeEach(() => {
    const home = createTmpHome();
    dbPath = path.join(home, ".jobjourney", "jobs.db");
  });

  it("adds the richer discovery columns to an existing jobs table and persists canonical fields", () => {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        description TEXT,
        salary TEXT,
        posted_date TEXT,
        job_type TEXT,
        workplace_type TEXT,
        company_logo_url TEXT,
        applicant_count TEXT,
        is_already_applied INTEGER DEFAULT 0,
        applied_date_utc TEXT,
        scraped_at TEXT NOT NULL,
        run_id INTEGER,
        keyword TEXT,
        search_location TEXT
      );
    `);
    legacyDb.close();

    const db = openDatabase(dbPath);
    const repo = new DiscoveryJobsRepo(db);
    const job = createEmptyDiscoveryJob({
      id: "li-1",
      source: "linkedin",
      title: "Senior Full Stack Engineer",
      company: "Example",
      location: "Sydney",
      description: "Hybrid role using Python and React.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      postedAt: "2026-03-10",
      extractedAt: "2026-03-15T00:00:00Z",
    });
    job.externalUrl = "https://boards.greenhouse.io/example/jobs/1";
    job.atsType = "greenhouse";
    job.atsIdentifier = "example";
    job.salary = "$120,000 per year";
    job.salaryRaw = "$120,000 per year";
    job.salaryMin = "120000";
    job.salaryMax = "120000";
    job.salaryCurrency = "$";
    job.salaryPeriod = "year";
    job.jobType = "full-time";
    job.workArrangement = "hybrid";
    job.requiredSkills = "Python, React";
    job.techStack = "[\"Python\",\"React\"]";
    job.experienceLevel = "senior";
    job.experienceYears = 5;
    job.isPrRequired = true;
    job.securityClearance = "NV1";
    job.prConfidence = "high";
    job.prReasoning = "Citizenship required with NV1 clearance";

    repo.upsertJobs([job], {
      keyword: "full stack",
      location: "Sydney",
    });

    const row = db
      .prepare(
        `SELECT url, job_url, external_url, ats_type, ats_identifier, posted_at, extracted_at,
                salary_raw, salary_min, salary_max, salary_currency, salary_period,
                work_arrangement, required_skills, tech_stack, experience_level,
                experience_years, is_pr_required, security_clearance, pr_confidence, pr_reasoning
         FROM jobs WHERE url = ?`,
      )
      .get("https://www.linkedin.com/jobs/view/1") as Record<string, unknown>;

    expect(row).toMatchObject({
      url: "https://www.linkedin.com/jobs/view/1",
      job_url: "https://www.linkedin.com/jobs/view/1",
      external_url: "https://boards.greenhouse.io/example/jobs/1",
      ats_type: "greenhouse",
      ats_identifier: "example",
      posted_at: "2026-03-10",
      extracted_at: "2026-03-15T00:00:00Z",
      salary_raw: "$120,000 per year",
      salary_min: "120000",
      salary_max: "120000",
      salary_currency: "$",
      salary_period: "year",
      work_arrangement: "hybrid",
      required_skills: "Python, React",
      tech_stack: "[\"Python\",\"React\"]",
      experience_level: "senior",
      experience_years: 5,
      is_pr_required: 1,
      security_clearance: "NV1",
      pr_confidence: "high",
      pr_reasoning: "Citizenship required with NV1 clearance",
    });

    db.close();
  });
});
