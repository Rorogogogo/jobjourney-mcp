import { type DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
export declare class IndeedBrowserSource implements DiscoverySourceRunner {
    readonly name: "indeed";
    private readonly scraper;
    discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
