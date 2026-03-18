import type { DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
export declare class IndeedBrowserSource implements DiscoverySourceRunner {
    readonly name: "indeed";
    discoverJobs(_request: DiscoverSourceRequest): Promise<DiscoveryJob[]>;
}
