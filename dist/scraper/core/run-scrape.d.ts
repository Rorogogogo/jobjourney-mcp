import type { ScrapeRequest, ScrapeResult } from "./types.js";
export interface RunScrapeOptions extends ScrapeRequest {
    dbPath?: string;
}
export declare function runScrape(options: RunScrapeOptions): Promise<ScrapeResult>;
export declare function getAvailableSources(): string[];
