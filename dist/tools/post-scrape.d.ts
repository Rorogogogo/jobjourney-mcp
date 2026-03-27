export interface ScrapeResult {
    runId: number;
    keyword: string;
    location: string;
    sources: string[];
    totalJobs: number;
    jobs: Array<{
        title: string;
        company: string;
        location: string;
    }>;
}
export declare function onScrapeComplete(result: ScrapeResult): Promise<void>;
