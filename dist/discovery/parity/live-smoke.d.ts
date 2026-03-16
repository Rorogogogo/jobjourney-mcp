import type { DiscoveryJob, DiscoveryRunOptions } from "../core/types.js";
export interface LiveParityExternalJobSummary {
    jobId: string;
    title: string;
    company: string;
    externalUrl: string;
    atsType: string;
}
export interface LiveParityEngineSummary {
    totalJobs: number;
    postedAtCount: number;
    externalUrlCount: number;
    atsBreakdown: Record<string, number>;
    firstJobIds: string[];
    externalJobs: LiveParityExternalJobSummary[];
}
export interface LiveParityRequest {
    keyword: string;
    location: string;
    pages: number;
    minDelay: number;
    maxDelay: number;
    sources: string[];
}
export interface LiveParityReport {
    generatedAt: string;
    request: LiveParityRequest;
    status: "matched" | "diverged";
    differences: string[];
    ts: LiveParityEngineSummary;
    python: LiveParityEngineSummary;
}
export interface RunLiveParitySmokeOptions {
    keyword?: string;
    location?: string;
    pages?: number;
    minDelay?: number;
    maxDelay?: number;
    sources?: string[];
    reportPath?: string;
    generatedAt?: () => string;
    persistTsJobs?: boolean;
    storeTsJobs?: (jobs: DiscoveryJob[], request: LiveParityRequest) => Promise<void> | void;
    executeTsRun?: (options: DiscoveryRunOptions) => Promise<DiscoveryJob[]>;
    executePythonRun?: (request: LiveParityRequest) => Promise<LiveParityEngineSummary>;
}
export interface LiveParitySmokeResult {
    report: LiveParityReport;
    reportPath: string;
}
export declare function runLiveParitySmoke(options?: RunLiveParitySmokeOptions): Promise<LiveParitySmokeResult>;
export declare function persistTsJobsToDatabase(jobs: DiscoveryJob[], request: LiveParityRequest): Promise<void>;
export declare function buildLiveParityReport(options: {
    generatedAt: string;
    request: LiveParityRequest;
    tsSummary: LiveParityEngineSummary;
    pythonSummary: LiveParityEngineSummary;
}): LiveParityReport;
export declare function writeLiveParityReport(report: LiveParityReport, reportPath: string): string;
export declare function summarizeDiscoveryJobs(jobs: DiscoveryJob[], source: string): LiveParityEngineSummary;
