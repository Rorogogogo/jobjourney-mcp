import type { DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";

export class IndeedBrowserSource implements DiscoverySourceRunner {
  readonly name = "indeed" as const;

  async discoverJobs(_request: DiscoverSourceRequest): Promise<DiscoveryJob[]> {
    throw new Error("Indeed browser discovery is planned but not implemented yet.");
  }
}
