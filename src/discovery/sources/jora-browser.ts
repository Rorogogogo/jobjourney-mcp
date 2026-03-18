import type { DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";

export class JoraBrowserSource implements DiscoverySourceRunner {
  readonly name = "jora" as const;

  async discoverJobs(_request: DiscoverSourceRequest): Promise<DiscoveryJob[]> {
    throw new Error("Jora browser discovery is planned but not implemented yet.");
  }
}
