import type { Page } from "playwright";
import type { ScrapeRequest, ScrapedJob, JobSourceScraper } from "../core/types.js";
export declare class LinkedInScraper implements JobSourceScraper {
    scrape(request: ScrapeRequest): Promise<ScrapedJob[]>;
}
export declare function scrapeLinkedInPage(page: Page, request: Pick<ScrapeRequest, "keyword" | "location">): Promise<ScrapedJob[]>;
