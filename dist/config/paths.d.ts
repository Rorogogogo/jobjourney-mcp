export interface JobJourneyPaths {
    dataDir: string;
    dbPath: string;
    heartbeatPath: string;
}
export declare function getJobJourneyPaths(homeDir?: string): JobJourneyPaths;
