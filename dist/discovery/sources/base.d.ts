import type { DiscoveryJob, DiscoverySourceName } from "../core/types.js";
export interface DiscoverSourceRequest {
    keyword: string;
    location: string;
    pages: number;
    extractedAt: string;
}
export interface DiscoverySourceRunner {
    name: DiscoverySourceName;
    discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
