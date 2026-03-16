import { SeekScraper } from "../../scraper/sources/seek.js";
import { createEmptyDiscoveryJob, type DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";

export class SeekBrowserSource implements DiscoverySourceRunner {
  readonly name = "seek" as const;

  private readonly scraper = new SeekScraper();

  async discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]> {
    const jobs = await this.scraper.scrape({
      keyword: request.keyword,
      location: request.location,
      source: "seek",
      maxPages: request.pages,
    });

    return jobs.map((job) => {
      const normalized = createEmptyDiscoveryJob({
        id: job.url || `${job.company}:${job.title}:${job.location}`,
        source: "seek",
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description || "",
        jobUrl: job.url,
        postedAt: job.postedDate || null,
        extractedAt: job.scrapedAt || request.extractedAt,
      });
      normalized.salary = job.salary || "";
      normalized.jobType = job.jobType || "";
      normalized.workArrangement = job.workplaceType || "";
      normalized.companyLogoUrl = job.companyLogoUrl || "";
      normalized.applicantCount = job.applicantCount || "";
      normalized.isAlreadyApplied = job.isAlreadyApplied || false;
      normalized.appliedDateUtc = job.appliedDateUtc || "";
      return normalized;
    });
  }
}
