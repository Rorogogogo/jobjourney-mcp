import type { DiscoveryJob } from "../core/types.js";
import type { SalaryNormalizationResult } from "./types.js";
export declare function enrichDiscoveryJob(job: DiscoveryJob): DiscoveryJob;
export declare function normalizeSalary(text: string): SalaryNormalizationResult;
export declare function extractSalary(text: string): string | null;
export declare function extractApplicantCount(text: string): string | null;
/**
 * Convert a relative date string (e.g. "3d ago", "Posted 2w ago", "30+ days ago",
 * "2 weeks ago", "1 month ago", "yesterday") into an ISO date string.
 * Returns null if the string can't be parsed.
 */
export declare function normalizePostedDate(raw: string): string | null;
