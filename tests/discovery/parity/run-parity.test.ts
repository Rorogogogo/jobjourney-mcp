import { describe, expect, it } from "vitest";
import {
  runParityHarness,
  type ParityCase,
} from "../../../src/discovery/parity/run-parity.js";

describe("runParityHarness", () => {
  it("compares TS and Python outputs for each manifest case", async () => {
    const cases: ParityCase[] = [
      {
        id: "linkedin-search-basic",
        kind: "linkedin_search_results",
        input: {
          html: "<div data-entity-urn='urn:li:jobPosting:123'></div>",
        },
      },
      {
        id: "detect-ats-basic",
        kind: "ats_detection",
        input: {
          applyUrl: "https://jobs.lever.co/netflix/abc123",
          easyApply: false,
        },
      },
    ];

    const result = await runParityHarness({
      cases,
      executeTsCase: async (parityCase) => {
        if (parityCase.kind === "linkedin_search_results") {
          return [{ jobId: "123" }];
        }

        return {
          atsType: "lever",
          companyIdentifier: "netflix",
        };
      },
      executePythonCase: async (parityCase) => {
        if (parityCase.kind === "linkedin_search_results") {
          return [{ jobId: "123" }];
        }

        return {
          atsType: "greenhouse",
          companyIdentifier: "stripe",
        };
      },
    });

    expect(result.summary).toEqual({
      totalCases: 2,
      passedCases: 1,
      failedCases: 1,
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      caseId: "linkedin-search-basic",
      passed: true,
    });
    expect(result.results[1]).toMatchObject({
      caseId: "detect-ats-basic",
      passed: false,
      diff: expect.stringContaining("companyIdentifier"),
      tsOutput: {
        atsType: "lever",
        companyIdentifier: "netflix",
      },
      pythonOutput: {
        atsType: "greenhouse",
        companyIdentifier: "stripe",
      },
    });
  });

  it("captures executor failures as parity failures", async () => {
    const result = await runParityHarness({
      cases: [
        {
          id: "python-error",
          kind: "salary_normalization",
          input: { text: "$120,000 per year" },
        },
      ],
      executeTsCase: async () => ({
        raw: "$120,000 per year",
      }),
      executePythonCase: async () => {
        throw new Error("python bridge failed");
      },
    });

    expect(result.summary).toEqual({
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
    });
    expect(result.results[0]).toMatchObject({
      caseId: "python-error",
      passed: false,
      diff: "python bridge failed",
    });
  });
});
