import { type DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
export declare class JoraBrowserSource implements DiscoverySourceRunner {
    readonly name: "jora";
    private readonly scraper;
    discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
