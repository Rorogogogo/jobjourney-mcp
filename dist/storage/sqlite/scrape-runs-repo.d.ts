import Database from "better-sqlite3";
export interface CreateRunInput {
    scheduleId?: number;
    keyword: string;
    location: string;
    source: string;
    runMode?: "scrape" | "discover";
    sources?: string | null;
}
export interface FinishRunInput {
    status: "success" | "error";
    jobCount?: number;
    error?: string;
}
export declare class ScrapeRunsRepo {
    private readonly db;
    constructor(db: Database.Database);
    createRun(run: CreateRunInput): {
        id: number;
    };
    finishRun(id: number, result: FinishRunInput): void;
    getLatestDiscoveryRun(): {
        id: number;
        keyword: string;
        location: string;
        source: string;
        run_mode: string;
        sources: string | null;
        status: string;
        started_at: string;
        finished_at: string | null;
        job_count: number | null;
        error: string | null;
    } | null;
}
