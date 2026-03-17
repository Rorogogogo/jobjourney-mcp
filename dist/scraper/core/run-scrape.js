import { openDatabase } from "../../storage/sqlite/db.js";
import { ScrapeRunsRepo } from "../../storage/sqlite/scrape-runs-repo.js";
import { runDiscovery } from "../../discovery/core/run-discovery.js";
import { getActiveDiscoverySourceNames } from "../../discovery/sources/registry.js";
import { DiscoveryJobsRepo } from "../../discovery/storage/discovery-jobs-repo.js";
import { renderMarkdownReport } from "./markdown.js";
export async function runScrape(request, dependencies = {}) {
    const availableSources = getAvailableSources();
    if (!availableSources.includes(request.source)) {
        throw new Error(`Unsupported source: ${request.source}`);
    }
    const db = openDatabase(request.dbPath);
    const runsRepo = new ScrapeRunsRepo(db);
    const jobsRepo = new DiscoveryJobsRepo(db);
    const run = runsRepo.createRun({
        keyword: request.keyword,
        location: request.location,
        source: request.source,
        runMode: "scrape",
        sources: request.source,
    });
    try {
        const runDiscoveryImpl = dependencies.runDiscovery ?? runDiscovery;
        const result = await runDiscoveryImpl({
            keyword: request.keyword,
            location: request.location,
            sources: [request.source],
            pages: request.maxPages,
        });
        const primaryJobs = result.jobs.filter((job) => isPrimaryPlatformJob(job, request.source));
        jobsRepo.upsertJobs(primaryJobs, {
            keyword: request.keyword,
            location: request.location,
            runId: run.id,
        });
        const scrapedJobs = primaryJobs.map(mapDiscoveryJobToScrapedJob);
        const markdown = renderMarkdownReport(scrapedJobs);
        runsRepo.finishRun(run.id, {
            status: "success",
            jobCount: scrapedJobs.length,
        });
        return {
            jobs: scrapedJobs,
            markdown,
            runId: run.id,
        };
    }
    catch (error) {
        runsRepo.finishRun(run.id, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
    finally {
        db.close();
    }
}
export function getAvailableSources() {
    return getActiveDiscoverySourceNames();
}
function isPrimaryPlatformJob(job, source) {
    const hostname = getHostname(job.jobUrl);
    if (!hostname) {
        return true;
    }
    switch (source) {
        case "linkedin":
            return hostname.includes("linkedin.com");
        case "seek":
            return hostname.includes("seek.");
        case "indeed":
            return hostname.includes("indeed.");
        case "jora":
            return hostname.includes("jora.");
        default:
            return true;
    }
}
function mapDiscoveryJobToScrapedJob(job) {
    return {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.jobUrl,
        source: job.source,
        description: job.description || undefined,
        salary: job.salary || undefined,
        postedDate: job.postedAt ?? undefined,
        jobType: job.jobType || undefined,
        workplaceType: job.workArrangement || undefined,
        companyLogoUrl: job.companyLogoUrl || undefined,
        applicantCount: job.applicantCount || undefined,
        isAlreadyApplied: job.isAlreadyApplied,
        appliedDateUtc: job.appliedDateUtc || undefined,
        scrapedAt: job.extractedAt,
    };
}
function getHostname(value) {
    try {
        return new URL(value).hostname.toLowerCase();
    }
    catch {
        return "";
    }
}
