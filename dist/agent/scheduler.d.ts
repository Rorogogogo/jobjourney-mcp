import { runScrape } from "../scraper/core/run-scrape.js";
import { runDiscovery } from "../discovery/core/run-discovery.js";
interface AgentSchedulerDeps {
    runScrape?: typeof runScrape;
    runDiscovery?: typeof runDiscovery;
}
export declare class AgentScheduler {
    private tasks;
    private dbPath?;
    private readonly runScrapeImpl;
    private readonly runDiscoveryImpl;
    constructor(dbPath?: string, deps?: AgentSchedulerDeps);
    private readonly discoveryLogger;
    reconcile(): void;
    private runScheduledJob;
    runScheduledJobForTest(id: number, keyword: string, location: string, source: string, runMode: string, sources: string | null): Promise<void>;
    stop(): void;
    get activeCount(): number;
}
export {};
