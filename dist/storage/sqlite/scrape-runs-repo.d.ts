import Database from "better-sqlite3";
export interface CreateRunInput {
    scheduleId?: number;
    keyword: string;
    location: string;
    source: string;
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
}
