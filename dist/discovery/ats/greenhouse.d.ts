import type { HttpClient } from "../utils/http.js";
import { type DiscoveryJob } from "../core/types.js";
interface GreenhouseJobItem {
    id?: string | number;
    title?: string;
    absolute_url?: string;
    updated_at?: string;
    created_at?: string;
    content?: string;
    location?: {
        name?: string;
    };
    metadata?: Array<{
        name?: string;
        value?: string;
    }>;
}
interface GreenhousePayload {
    jobs?: GreenhouseJobItem[];
}
export declare class GreenhouseCrawler {
    private readonly httpClient;
    readonly name: "greenhouse";
    readonly atsType = "greenhouse";
    constructor(httpClient: HttpClient);
    crawlJobs(companyIdentifier: string, extractedAt: string): Promise<DiscoveryJob[]>;
}
export declare function normalizeGreenhouseJobs(payload: GreenhousePayload, companyIdentifier: string, extractedAt: string): DiscoveryJob[];
export {};
