import { runDiscovery } from "../discovery/core/run-discovery.js";
interface AgentSchedulerDeps {
    runDiscovery?: typeof runDiscovery;
}
export declare class AgentScheduler {
    private tasks;
    private dbPath?;
    private readonly runDiscoveryImpl;
    constructor(dbPath?: string, deps?: AgentSchedulerDeps);
    private readonly discoveryLogger;
    reconcile(): void;
    private runScheduledJob;
    runScheduledJobForTest(id: number, keyword: string, location: string, source: string, runMode: string, sources: string | null, pages?: number | null): Promise<void>;
    stop(): void;
    get activeCount(): number;
}
export {};
