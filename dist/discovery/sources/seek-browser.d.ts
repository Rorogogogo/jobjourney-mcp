import { type DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
export declare class SeekBrowserSource implements DiscoverySourceRunner {
    readonly name: "seek";
    private readonly scraper;
    discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
