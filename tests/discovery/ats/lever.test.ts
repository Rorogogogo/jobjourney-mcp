import { describe, expect, it } from "vitest";
import { normalizeLeverJobs } from "../../../src/discovery/ats/lever.js";

describe("normalizeLeverJobs", () => {
  it("normalizes lever payloads into canonical discovery jobs", () => {
    const jobs = normalizeLeverJobs(
      [
        {
          id: "abc123",
          text: "Mid-Market Account Executive",
          hostedUrl: "https://jobs.lever.co/blinq/abc123",
          createdAt: 1704067200000,
          descriptionPlain: "Sell software.",
          categories: {
            location: "Sydney",
            commitment: "Full-time",
          },
          salaryRange: {
            min: 100000,
            max: 150000,
            currency: "usd",
            interval: "per-year-salary",
          },
        },
      ],
      "blinq",
      "2026-03-15T00:00:00Z",
    );

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "abc123",
        title: "Mid-Market Account Executive",
        company: "blinq",
        location: "Sydney",
        description: "Sell software.",
        jobUrl: "https://jobs.lever.co/blinq/abc123",
        externalUrl: "https://jobs.lever.co/blinq/abc123",
        atsType: "lever",
        source: "lever",
        postedAt: "2024-01-01T00:00:00+00:00",
        extractedAt: "2026-03-15T00:00:00Z",
        salary: "USD 100,000 - USD 150,000 per year",
        salaryRaw: "USD 100,000 - USD 150,000 per year",
        salaryMin: "100000",
        salaryMax: "150000",
        salaryCurrency: "USD",
        salaryPeriod: "year",
        jobType: "Full-time",
      }),
    ]);
  });
});
