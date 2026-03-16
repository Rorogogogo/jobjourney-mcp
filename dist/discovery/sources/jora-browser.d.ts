import type { DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
export declare class JoraBrowserSource implements DiscoverySourceRunner {
    readonly name: "jora";
    discoverJobs(_request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
