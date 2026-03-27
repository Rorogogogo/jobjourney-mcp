import { IndeedScraper } from "../../scraper/sources/indeed.js";
import { createEmptyDiscoveryJob } from "../core/types.js";
export class IndeedBrowserSource {
    name = "indeed";
    scraper = new IndeedScraper();
    async discoverJobs(request) {
        const jobs = await this.scraper.scrape({
            keyword: request.keyword,
            location: request.location,
            source: "indeed",
            maxPages: request.pages,
        });
        return jobs.map((job) => {
            const normalized = createEmptyDiscoveryJob({
                id: job.url || `${job.company}:${job.title}:${job.location}`,
                source: "indeed",
                title: job.title,
                company: job.company,
                location: job.location,
                description: job.description || "",
                jobUrl: job.url,
                postedAt: job.postedDate || null,
                extractedAt: job.scrapedAt || request.extractedAt,
            });
            normalized.externalUrl = job.externalUrl || "";
            normalized.salary = job.salary || "";
            normalized.jobType = job.jobType || "";
            return normalized;
        });
    }
}
