import { describe, expect, it } from "vitest";
import { createEmptyDiscoveryJob } from "../../../src/discovery/core/types.js";

describe("createEmptyDiscoveryJob", () => {
  it("builds the canonical discovery job shape with crawler-aligned defaults", () => {
    const job = createEmptyDiscoveryJob({
      id: "123",
      source: "linkedin",
      title: "Full Stack Engineer",
      company: "Example",
      location: "Sydney",
      description: "",
      jobUrl: "https://www.linkedin.com/jobs/view/123",
      extractedAt: "2026-03-15T00:00:00Z",
    });

    expect(job).toEqual({
      id: "123",
      source: "linkedin",
      title: "Full Stack Engineer",
      company: "Example",
      location: "Sydney",
      description: "",
      jobUrl: "https://www.linkedin.com/jobs/view/123",
      externalUrl: "",
      atsType: "unknown",
      atsIdentifier: "",
      postedAt: null,
      extractedAt: "2026-03-15T00:00:00Z",
      salary: "",
      salaryRaw: "",
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
      salaryPeriod: "",
      jobType: "",
      workArrangement: "",
      applicantCount: "",
      requiredSkills: "",
      techStack: "[]",
      experienceLevel: "",
      experienceYears: null,
      isPrRequired: false,
      securityClearance: "",
      prConfidence: "",
      prReasoning: "",
      companyLogoUrl: "",
      isAlreadyApplied: false,
      appliedDateUtc: "",
    });
  });
});
