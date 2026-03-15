import { describe, expect, it } from "vitest";
import { normalizeGreenhouseJobs } from "../../../src/discovery/ats/greenhouse.js";

describe("normalizeGreenhouseJobs", () => {
  it("normalizes greenhouse payloads into canonical discovery jobs", () => {
    const jobs = normalizeGreenhouseJobs(
      {
        jobs: [
          {
            id: 101,
            title: "Software Engineer",
            absolute_url: "https://boards.greenhouse.io/stripe/jobs/101",
            updated_at: "2026-03-10T00:00:00Z",
            location: { name: "Sydney" },
            content: "<p>Who we are &amp; About Stripe</p><p>Build systems.</p>",
            metadata: [
              { name: "Salary", value: "AUD 120,000 to AUD 140,000" },
              { name: "Employment Type", value: "Full-time" },
            ],
          },
        ],
      },
      "stripe",
      "2026-03-15T00:00:00Z",
    );

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "101",
        title: "Software Engineer",
        company: "stripe",
        location: "Sydney",
        description: "Who we are & About Stripe Build systems.",
        jobUrl: "https://boards.greenhouse.io/stripe/jobs/101",
        externalUrl: "https://boards.greenhouse.io/stripe/jobs/101",
        atsType: "greenhouse",
        source: "greenhouse",
        postedAt: "2026-03-10T00:00:00Z",
        extractedAt: "2026-03-15T00:00:00Z",
        salary: "AUD 120,000 to AUD 140,000",
        jobType: "Full-time",
      }),
    ]);
  });
});
