import { describe, expect, it, vi } from "vitest";
import { runDiscovery } from "../../../src/discovery/core/run-discovery.js";
import { createEmptyDiscoveryJob } from "../../../src/discovery/core/types.js";

describe("runDiscovery", () => {
  it("continues when one source fails and returns jobs from successful sources", async () => {
    const seekJob = createEmptyDiscoveryJob({
      id: "seek-1",
      source: "seek",
      title: "Full Stack Engineer",
      company: "Example",
      location: "Sydney",
      description: "Hybrid full-time role with React and AWS.",
      jobUrl: "https://seek.example/jobs/1",
      extractedAt: "2026-03-15T00:00:00Z",
    });

    const result = await runDiscovery(
      {
        keyword: "full stack",
        location: "Sydney",
        sources: ["linkedin", "seek"],
      },
      {
        sourceFactories: {
          linkedin: () => ({
            name: "linkedin",
            discoverJobs: async () => {
              throw new Error("blocked");
            },
          }),
          seek: () => ({
            name: "seek",
            discoverJobs: async () => [seekJob],
          }),
        },
        atsCrawlerFactories: {},
        extractedAt: () => "2026-03-15T00:00:00Z",
      },
    );

    expect(result.sources).toEqual(["seek"]);
    expect(result.failedSources).toEqual(["linkedin"]);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: "seek-1",
      source: "seek",
      workArrangement: "hybrid",
      jobType: "full-time",
      techStack: JSON.stringify(["AWS", "React"]),
    });
  });

  it("emits source lifecycle logs during discovery", async () => {
    const logger = vi.fn();

    await runDiscovery(
      {
        keyword: "full stack",
        location: "Sydney",
        sources: ["seek"],
      },
      {
        sourceFactories: {
          seek: () => ({
            name: "seek",
            discoverJobs: async () => [],
          }),
        },
        atsCrawlerFactories: {},
        extractedAt: () => "2026-03-15T00:00:00Z",
        logger,
      },
    );

    expect(logger).toHaveBeenCalledWith({
      event: "discovery_source_start",
      source: "seek",
      keyword: "full stack",
      location: "Sydney",
      pages: 30,
    });
    expect(logger).toHaveBeenCalledWith({
      event: "discovery_source_success",
      source: "seek",
      discoveredJobs: 0,
    });
  });

  it("expands supported ATS companies only once per ats/company pair", async () => {
    const crawlJobs = vi.fn(async () => [
      createEmptyDiscoveryJob({
        id: "gh-1",
        source: "greenhouse",
        title: "Backend Engineer",
        company: "stripe",
        location: "Sydney",
        description: "Python and PostgreSQL role.",
        jobUrl: "https://boards.greenhouse.io/stripe/jobs/1",
        extractedAt: "2026-03-15T00:00:00Z",
      }),
    ]);

    const baseJob = createEmptyDiscoveryJob({
      id: "li-1",
      source: "linkedin",
      title: "Software Engineer",
      company: "Stripe",
      location: "Sydney",
      description: "Senior hybrid role with Python and AWS.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      extractedAt: "2026-03-15T00:00:00Z",
    });
    baseJob.externalUrl = "https://boards.greenhouse.io/stripe/jobs/123";

    const duplicateCompanyJob = createEmptyDiscoveryJob({
      id: "li-2",
      source: "linkedin",
      title: "Platform Engineer",
      company: "Stripe",
      location: "Sydney",
      description: "Another job.",
      jobUrl: "https://www.linkedin.com/jobs/view/2",
      extractedAt: "2026-03-15T00:00:00Z",
    });
    duplicateCompanyJob.externalUrl = "https://boards.greenhouse.io/stripe/jobs/456";

    const result = await runDiscovery(
      {
        keyword: "software engineer",
        location: "Sydney",
        sources: ["linkedin"],
      },
      {
        sourceFactories: {
          linkedin: () => ({
            name: "linkedin",
            discoverJobs: async () => [baseJob, duplicateCompanyJob],
          }),
        },
        atsCrawlerFactories: {
          greenhouse: () => ({
            name: "greenhouse",
            crawlJobs,
          }),
        },
        extractedAt: () => "2026-03-15T00:00:00Z",
      },
    );

    expect(crawlJobs).toHaveBeenCalledTimes(1);
    expect(crawlJobs).toHaveBeenCalledWith("stripe", "2026-03-15T00:00:00Z");
    expect(result.expandedCompanies).toEqual(["greenhouse:stripe"]);
    expect(result.jobs).toHaveLength(3);
    expect(result.jobs[0]).toMatchObject({
      source: "linkedin",
      atsType: "greenhouse",
      atsIdentifier: "stripe",
      workArrangement: "hybrid",
      experienceLevel: "senior",
    });
    expect(
      result.jobs.find((job) => job.source === "linkedin" && job.id === "gh-1"),
    ).toMatchObject({
      source: "linkedin",
      atsType: "greenhouse",
      techStack: JSON.stringify(["PostgreSQL", "Python"]),
    });
  });
});
