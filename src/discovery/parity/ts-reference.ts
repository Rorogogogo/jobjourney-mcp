import { detectAts } from "../ats/detector.js";
import { normalizeSalary } from "../analysis/enrichment.js";
import {
  parseLinkedInGuestJobDetail,
  parseLinkedInGuestSearchResults,
} from "../sources/linkedin-guest.js";
import type { ParityCase } from "./types.js";

export async function executeTsParityCase(parityCase: ParityCase): Promise<unknown> {
  switch (parityCase.kind) {
    case "linkedin_search_results":
      return parseLinkedInGuestSearchResults(parityCase.input.html);
    case "linkedin_job_detail":
      return parseLinkedInGuestJobDetail(parityCase.input.html, {
        jobId: parityCase.input.jobId,
        jobUrl: parityCase.input.jobUrl,
      });
    case "ats_detection":
      return detectAts(parityCase.input.applyUrl, {
        easyApply: parityCase.input.easyApply,
      });
    case "salary_normalization":
      return normalizeSalary(parityCase.input.text);
    default:
      return assertNever(parityCase);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported parity case: ${JSON.stringify(value)}`);
}
