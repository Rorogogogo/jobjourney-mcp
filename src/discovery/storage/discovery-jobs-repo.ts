import Database from "better-sqlite3";
import type { DiscoveryJob } from "../core/types.js";
import { JobsRepo } from "../../storage/sqlite/jobs-repo.js";

export interface DiscoverySaveContext {
  keyword?: string;
  location?: string;
  runId?: number;
}

export class DiscoveryJobsRepo {
  private readonly jobsRepo: JobsRepo;

  constructor(private readonly db: Database.Database) {
    this.jobsRepo = new JobsRepo(db);
  }

  upsertJobs(jobs: DiscoveryJob[], context: DiscoverySaveContext = {}): void {
    this.jobsRepo.upsertJobs(
      jobs.map((job) => ({
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.jobUrl,
        jobUrl: job.jobUrl,
        externalUrl: job.externalUrl,
        source: job.source,
        atsType: job.atsType,
        atsIdentifier: job.atsIdentifier,
        description: job.description,
        salary: job.salary,
        postedDate: job.postedAt ?? undefined,
        postedAt: job.postedAt ?? undefined,
        jobType: job.jobType,
        workplaceType: job.workArrangement,
        workArrangement: job.workArrangement,
        companyLogoUrl: job.companyLogoUrl,
        applicantCount: job.applicantCount,
        isAlreadyApplied: job.isAlreadyApplied,
        appliedDateUtc: job.appliedDateUtc,
        scrapedAt: job.extractedAt,
        extractedAt: job.extractedAt,
        salaryRaw: job.salaryRaw,
        salaryMin: job.salaryMin || undefined,
        salaryMax: job.salaryMax || undefined,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        requiredSkills: job.requiredSkills,
        techStack: job.techStack,
        experienceLevel: job.experienceLevel,
        experienceYears: job.experienceYears,
        isPrRequired: job.isPrRequired,
        securityClearance: job.securityClearance,
        prConfidence: job.prConfidence,
        prReasoning: job.prReasoning,
        runId: context.runId,
        keyword: context.keyword,
        searchLocation: context.location,
      })),
    );
  }
}
