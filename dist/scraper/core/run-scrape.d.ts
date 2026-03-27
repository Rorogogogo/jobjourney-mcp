import { runDiscovery, type RunDiscoveryDependencies } from "../../discovery/core/run-discovery.js";
import type { DiscoverySourceName } from "../../discovery/core/types.js";
import type { ScrapeRequest, ScrapeResult } from "./types.js";
export interface RunScrapeDependencies {
    runDiscovery?: (options: {
        keyword: string;
        location: string;
        sources: DiscoverySourceName[];
        pages?: number;
    }, dependencies?: RunDiscoveryDependencies) => ReturnType<typeof runDiscovery>;
}
export declare function runScrape(request: ScrapeRequest & {
    dbPath?: string;
}, dependencies?: RunScrapeDependencies): Promise<ScrapeResult>;
export declare function getAvailableSources(): string[];
