import type { DiscoveryJob } from "./types.js";
export declare function normalizeDiscoveryJob(job: DiscoveryJob): DiscoveryJob;
/**
 * Normalize a string for fuzzy dedup comparison:
 * lowercase, collapse whitespace, strip common suffixes and punctuation.
 */
export declare function normalizeForDedup(value: string): string;
/**
 * Build a cross-platform dedup key from normalized company + title.
 * This allows detecting the same job posted on different platforms.
 */
export declare function crossPlatformDedupKey(job: DiscoveryJob): string;
/**
 * Count how many non-empty "richness" fields a job has.
 * Used to pick the best version when deduplicating.
 */
export declare function jobRichness(job: DiscoveryJob): number;
