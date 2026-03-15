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
export declare class JobsRepo {
    private readonly db;
    constructor(db: Database.Database);
    upsertJobs(jobs: JobRecordInput[]): void;
    search(filters: JobSearchFilters): JobRow[];
}
