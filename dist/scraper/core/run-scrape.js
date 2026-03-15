import { openDatabase } from "../../storage/sqlite/db.js";
import { JobsRepo } from "../../storage/sqlite/jobs-repo.js";
import { ScrapeRunsRepo } from "../../storage/sqlite/scrape-runs-repo.js";
import { renderMarkdownReport } from "./markdown.js";
import { SeekScraper } from "../sources/seek.js";
import { LinkedInScraper } from "../sources/linkedin.js";
const scrapers = {
    seek: () => new SeekScraper(),
    linkedin: () => new LinkedInScraper(),
};
export async function runScrape(options) {
    const { keyword, location, source, dbPath } = options;
    const scraperFactory = scrapers[source.toLowerCase()];
    if (!scraperFactory) {
        throw new Error(`Unsupported source: ${source}. Available: ${Object.keys(scrapers).join(", ")}`);
    }
    const db = openDatabase(dbPath);
    const jobsRepo = new JobsRepo(db);
    const runsRepo = new ScrapeRunsRepo(db);
    const run = runsRepo.createRun({ keyword, location, source });
    try {
        const scraper = scraperFactory();
        const jobs = await scraper.scrape({ keyword, location, source, maxPages: options.maxPages });
        jobsRepo.upsertJobs(jobs.map((job) => ({
            ...job,
            runId: run.id,
            keyword,
            searchLocation: location,
        })));
        const markdown = renderMarkdownReport(jobs);
        runsRepo.finishRun(run.id, { status: "success", jobCount: jobs.length });
        return { jobs, markdown, runId: run.id };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        runsRepo.finishRun(run.id, { status: "error", error: message });
        throw error;
    }
    finally {
        db.close();
    }
}
export function getAvailableSources() {
    return Object.keys(scrapers);
}
