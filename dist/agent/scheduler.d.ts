export declare class AgentScheduler {
    private tasks;
    private dbPath?;
    constructor(dbPath?: string);
    reconcile(): void;
    private runScheduledScrape;
    stop(): void;
    get activeCount(): number;
}
