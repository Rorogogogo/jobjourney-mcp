import type { Page } from "playwright";
import type { ScrapeRequest, ScrapedJob, JobSourceScraper } from "../core/types.js";
export declare class JoraScraper implements JobSourceScraper {
    scrape(request: ScrapeRequest): Promise<ScrapedJob[]>;
}
export declare function dismissPopups(page: Page): Promise<void>;
