import type { ScrapeRequest, ScrapedJob, JobSourceScraper } from "../core/types.js";
/**
 * Indeed scraper — card-only extraction (no click-through).
 *
 * Indeed cards navigate away from the search page on click (no split-serp),
 * and redirect links are behind Cloudflare verification, so we extract
 * all available data directly from the search results cards.
 */
export declare class IndeedScraper implements JobSourceScraper {
    scrape(request: ScrapeRequest): Promise<ScrapedJob[]>;
}
