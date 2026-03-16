import { type DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
import type { HttpClient } from "../utils/http.js";
export interface LinkedInGuestSearchCard {
    jobId: string;
    title: string;
    company: string;
    location: string;
    jobUrl: string;
    postedAt: string | null;
}
export interface LinkedInGuestJobDetail {
    jobId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyUrl: string | null;
    isEasyApply: boolean;
    jobUrl: string;
    applicantCount: string;
}
export declare class LinkedInGuestSource implements DiscoverySourceRunner {
    private readonly httpClient;
    readonly name: "linkedin";
    constructor(httpClient: HttpClient);
    discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
export declare function parseLinkedInGuestSearchResults(html: string): LinkedInGuestSearchCard[];
export declare function parseLinkedInGuestJobDetail(html: string, options: {
    jobId: string;
    jobUrl?: string;
}): LinkedInGuestJobDetail;
