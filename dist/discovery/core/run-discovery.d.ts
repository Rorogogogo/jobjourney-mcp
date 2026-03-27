import { HttpClient } from "../utils/http.js";
import type { DiscoverySourceRunner } from "../sources/base.js";
import type { AtsProviderName } from "../ats/registry.js";
import type { DiscoveryJob, DiscoveryRunOptions, DiscoveryRunResult, DiscoverySourceName } from "./types.js";
import type { CompanyCareerDiscovererLike } from "../fallback/company-site.js";
export interface AtsCrawlerRunner {
    name: AtsProviderName;
    crawlJobs(companyIdentifier: string, extractedAt: string): Promise<DiscoveryJob[]>;
}
export interface RunDiscoveryDependencies {
    sourceFactories?: Partial<Record<DiscoverySourceName, () => DiscoverySourceRunner>>;
    atsCrawlerFactories?: Partial<Record<AtsProviderName, () => AtsCrawlerRunner>>;
    extractedAt?: () => string;
    httpClient?: HttpClient;
    careerDiscoverer?: CompanyCareerDiscovererLike;
    logger?: (payload: Record<string, unknown>) => void;
    /** Called after each source completes with its batch of jobs, enabling incremental persistence. */
    onJobsBatch?: (jobs: DiscoveryJob[], source: DiscoverySourceName) => void;
}
export declare function runDiscovery(options: DiscoveryRunOptions, dependencies?: RunDiscoveryDependencies): Promise<DiscoveryRunResult>;
