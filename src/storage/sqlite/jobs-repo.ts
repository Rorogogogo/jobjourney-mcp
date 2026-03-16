import Database from "better-sqlite3";

export interface JobRecordInput {
  title: string;
  company: string;
  location: string;
  url: string;
  jobUrl?: string;
  externalUrl?: string;
  source: string;
  atsType?: string;
  atsIdentifier?: string;
  description?: string;
  salary?: string;
  postedDate?: string;
  postedAt?: string;
  jobType?: string;
  workplaceType?: string;
  workArrangement?: string;
  companyLogoUrl?: string;
  applicantCount?: string;
  isAlreadyApplied?: boolean;
  appliedDateUtc?: string;
  scrapedAt: string;
  extractedAt?: string;
  salaryRaw?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  salaryPeriod?: string;
  requiredSkills?: string;
  techStack?: string;
  experienceLevel?: string;
  experienceYears?: number | null;
  isPrRequired?: boolean;
  securityClearance?: string;
  prConfidence?: string;
  prReasoning?: string;
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
  job_url: string | null;
  external_url: string | null;
  source: string;
  ats_type: string | null;
  ats_identifier: string | null;
  description: string | null;
  salary: string | null;
  posted_date: string | null;
  posted_at: string | null;
  job_type: string | null;
  workplace_type: string | null;
  work_arrangement: string | null;
  company_logo_url: string | null;
  applicant_count: string | null;
  is_already_applied: number;
  applied_date_utc: string | null;
  scraped_at: string;
  extracted_at: string | null;
  salary_raw: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  required_skills: string | null;
  tech_stack: string | null;
  experience_level: string | null;
  experience_years: number | null;
  is_pr_required: number;
  security_clearance: string | null;
  pr_confidence: string | null;
  pr_reasoning: string | null;
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
        title, company, location, url, job_url, external_url, source, ats_type, ats_identifier,
        description, salary, posted_date, posted_at, job_type, workplace_type, work_arrangement,
        company_logo_url, applicant_count, is_already_applied, applied_date_utc,
        scraped_at, extracted_at, salary_raw, salary_min, salary_max, salary_currency, salary_period,
        required_skills, tech_stack, experience_level, experience_years, is_pr_required,
        security_clearance, pr_confidence, pr_reasoning,
        run_id, keyword, search_location
      )
      VALUES (
        @title, @company, @location, @url, @jobUrl, @externalUrl, @source, @atsType, @atsIdentifier,
        @description, @salary, @postedDate, @postedAt, @jobType, @workplaceType, @workArrangement,
        @companyLogoUrl, @applicantCount, @isAlreadyApplied, @appliedDateUtc,
        @scrapedAt, @extractedAt, @salaryRaw, @salaryMin, @salaryMax, @salaryCurrency, @salaryPeriod,
        @requiredSkills, @techStack, @experienceLevel, @experienceYears, @isPrRequired,
        @securityClearance, @prConfidence, @prReasoning,
        @runId, @keyword, @searchLocation
      )
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        location = excluded.location,
        job_url = excluded.job_url,
        external_url = excluded.external_url,
        source = excluded.source,
        ats_type = excluded.ats_type,
        ats_identifier = excluded.ats_identifier,
        description = excluded.description,
        salary = excluded.salary,
        posted_date = excluded.posted_date,
        posted_at = excluded.posted_at,
        job_type = excluded.job_type,
        workplace_type = excluded.workplace_type,
        work_arrangement = excluded.work_arrangement,
        company_logo_url = excluded.company_logo_url,
        applicant_count = excluded.applicant_count,
        is_already_applied = excluded.is_already_applied,
        applied_date_utc = excluded.applied_date_utc,
        scraped_at = excluded.scraped_at,
        extracted_at = excluded.extracted_at,
        salary_raw = excluded.salary_raw,
        salary_min = excluded.salary_min,
        salary_max = excluded.salary_max,
        salary_currency = excluded.salary_currency,
        salary_period = excluded.salary_period,
        required_skills = excluded.required_skills,
        tech_stack = excluded.tech_stack,
        experience_level = excluded.experience_level,
        experience_years = excluded.experience_years,
        is_pr_required = excluded.is_pr_required,
        security_clearance = excluded.security_clearance,
        pr_confidence = excluded.pr_confidence,
        pr_reasoning = excluded.pr_reasoning,
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
          jobUrl: job.jobUrl ?? job.url,
          externalUrl: job.externalUrl ?? null,
          source: job.source,
          atsType: job.atsType ?? null,
          atsIdentifier: job.atsIdentifier ?? null,
          description: job.description ?? null,
          salary: job.salary ?? null,
          postedDate: job.postedDate ?? null,
          postedAt: job.postedAt ?? null,
          jobType: job.jobType ?? null,
          workplaceType: job.workplaceType ?? null,
          workArrangement: job.workArrangement ?? null,
          companyLogoUrl: job.companyLogoUrl ?? null,
          applicantCount: job.applicantCount ?? null,
          isAlreadyApplied: job.isAlreadyApplied ? 1 : 0,
          appliedDateUtc: job.appliedDateUtc ?? null,
          scrapedAt: job.scrapedAt,
          extractedAt: job.extractedAt ?? job.scrapedAt,
          salaryRaw: job.salaryRaw ?? null,
          salaryMin: job.salaryMin ?? null,
          salaryMax: job.salaryMax ?? null,
          salaryCurrency: job.salaryCurrency ?? null,
          salaryPeriod: job.salaryPeriod ?? null,
          requiredSkills: job.requiredSkills ?? null,
          techStack: job.techStack ?? null,
          experienceLevel: job.experienceLevel ?? null,
          experienceYears: job.experienceYears ?? null,
          isPrRequired: job.isPrRequired ? 1 : 0,
          securityClearance: job.securityClearance ?? null,
          prConfidence: job.prConfidence ?? null,
          prReasoning: job.prReasoning ?? null,
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
