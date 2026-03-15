import type { DiscoveryRunOptions, DiscoveryRunResult } from "./types.js";

export async function runDiscovery(
  options: DiscoveryRunOptions,
): Promise<DiscoveryRunResult> {
  return {
    jobs: [],
    sources: options.sources ?? [],
  };
}
