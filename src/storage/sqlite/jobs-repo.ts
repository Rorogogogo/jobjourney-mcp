import Database from "better-sqlite3";

export interface JobRecordInput {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description?: string;
  salary?: string;
  postedDate?: string;
  jobType?: string;
  workplaceType?: string;
  companyLogoUrl?: string;
  applicantCount?: string;
  isAlreadyApplied?: boolean;
  appliedDateUtc?: string;
  scrapedAt: string;
  runId?: number;
  keyword?: string;
  searchLocation?: string;
}

export interface JobSearchFilters {
  keyword?: string;
  location?: string;
  source?: string;
  limit?: number;
}

export interface JobRow {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string | null;
  salary: string | null;
  posted_date: string | null;
  job_type: string | null;
  workplace_type: string | null;
  company_logo_url: string | null;
  applicant_count: string | null;
  is_already_applied: number;
  applied_date_utc: string | null;
  scraped_at: string;
  run_id: number | null;
  keyword: string | null;
  search_location: string | null;
}

export class JobsRepo {
  constructor(private readonly db: Database.Database) {}

  upsertJobs(jobs: JobRecordInput[]): void {
    if (jobs.length === 0) {
      return;
    }

    const statement = this.db.prepare(`
      INSERT INTO jobs (
        title, company, location, url, source,
        description, salary, posted_date, job_type, workplace_type,
        company_logo_url, applicant_count, is_already_applied, applied_date_utc,
        scraped_at, run_id, keyword, search_location
      )
      VALUES (
        @title, @company, @location, @url, @source,
        @description, @salary, @postedDate, @jobType, @workplaceType,
        @companyLogoUrl, @applicantCount, @isAlreadyApplied, @appliedDateUtc,
        @scrapedAt, @runId, @keyword, @searchLocation
      )
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        location = excluded.location,
        source = excluded.source,
        description = excluded.description,
        salary = excluded.salary,
        posted_date = excluded.posted_date,
        job_type = excluded.job_type,
        workplace_type = excluded.workplace_type,
        company_logo_url = excluded.company_logo_url,
        applicant_count = excluded.applicant_count,
        is_already_applied = excluded.is_already_applied,
        applied_date_utc = excluded.applied_date_utc,
        scraped_at = excluded.scraped_at,
        run_id = excluded.run_id,
        keyword = excluded.keyword,
        search_location = excluded.search_location
    `);

    const upsertMany = this.db.transaction((rows: JobRecordInput[]) => {
      for (const job of rows) {
        statement.run({
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          source: job.source,
          description: job.description ?? null,
          salary: job.salary ?? null,
          postedDate: job.postedDate ?? null,
          jobType: job.jobType ?? null,
          workplaceType: job.workplaceType ?? null,
          companyLogoUrl: job.companyLogoUrl ?? null,
          applicantCount: job.applicantCount ?? null,
          isAlreadyApplied: job.isAlreadyApplied ? 1 : 0,
          appliedDateUtc: job.appliedDateUtc ?? null,
          scrapedAt: job.scrapedAt,
          runId: job.runId ?? null,
          keyword: job.keyword ?? null,
          searchLocation: job.searchLocation ?? null,
        });
      }
    });

    upsertMany(jobs);
  }

  search(filters: JobSearchFilters): JobRow[] {
    const where: string[] = [];
    const params: Record<string, string | number> = {
      limit: filters.limit ?? 50,
    };

    if (filters.keyword) {
      where.push("(title LIKE @keyword OR company LIKE @keyword)");
      params.keyword = `%${filters.keyword}%`;
    }

    if (filters.location) {
      where.push("location LIKE @location");
      params.location = `%${filters.location}%`;
    }

    if (filters.source) {
      where.push("source = @source");
      params.source = filters.source;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT * FROM jobs ${whereClause} ORDER BY scraped_at DESC LIMIT @limit`,
      )
      .all(params) as JobRow[];
  }
}
