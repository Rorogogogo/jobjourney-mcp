import type { HttpClient } from "../utils/http.js";
import { type DiscoveryJob } from "../core/types.js";
interface LeverJobItem {
    id?: string;
    text?: string;
    hostedUrl?: string;
    applyUrl?: string;
    createdAt?: string | number;
    descriptionPlain?: string;
    description?: string;
    salaryDescription?: string;
    compensation?: string;
    salaryRange?: {
        min?: number;
        max?: number;
        currency?: string;
        interval?: string;
    };
    categories?: {
        location?: string;
        commitment?: string;
    };
}
export declare class LeverCrawler {
    private readonly httpClient;
    readonly atsType = "lever";
    constructor(httpClient: HttpClient);
    crawlJobs(companyIdentifier: string, extractedAt: string): Promise<DiscoveryJob[]>;
}
export declare function normalizeLeverJobs(payload: LeverJobItem[], companyIdentifier: string, extractedAt: string): DiscoveryJob[];
export {};
