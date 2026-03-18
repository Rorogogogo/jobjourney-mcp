import type { DiscoveryJob } from "./types.js";

export function normalizeDiscoveryJob(job: DiscoveryJob): DiscoveryJob {
  return {
    ...job,
    title: job.title.trim(),
    company: job.company.trim(),
    location: job.location.trim(),
    description: job.description.trim(),
  };
}
