import type { DiscoveryJob } from "../core/types.js";
import type { SalaryNormalizationResult } from "./types.js";
export declare function enrichDiscoveryJob(job: DiscoveryJob): DiscoveryJob;
export declare function normalizeSalary(text: string): SalaryNormalizationResult;
export declare function extractSalary(text: string): string | null;
export declare function extractApplicantCount(text: string): string | null;
