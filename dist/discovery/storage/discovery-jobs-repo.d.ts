import Database from "better-sqlite3";
import type { DiscoveryJob } from "../core/types.js";
export interface DiscoverySaveContext {
    keyword?: string;
    location?: string;
    runId?: number;
}
export declare class DiscoveryJobsRepo {
    private readonly db;
    private readonly jobsRepo;
    constructor(db: Database.Database);
    upsertJobs(jobs: DiscoveryJob[], context?: DiscoverySaveContext): void;
}
