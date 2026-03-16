import { describe, expect, it, vi } from "vitest";
import { runDiscovery } from "../../../src/discovery/core/run-discovery.js";
import { createEmptyDiscoveryJob } from "../../../src/discovery/core/types.js";

describe("runDiscovery fallback", () => {
  it("uses career discovery to recover ATS expansion when enabled", async () => {
    const crawlJobs = vi.fn(async () => [
      createEmptyDiscoveryJob({
        id: "gh-1",
        source: "greenhouse",
        title: "Backend Engineer",
        company: "example",
        location: "Sydney",
        description: "Python role.",
        jobUrl: "https://boards.greenhouse.io/example/jobs/1",
        extractedAt: "2026-03-15T00:00:00Z",
      }),
    ]);

    const linkedInJob = createEmptyDiscoveryJob({
      id: "li-1",
      source: "linkedin",
      title: "Software Engineer",
      company: "Example Co",
      location: "Sydney",
      description: "Role description.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      extractedAt: "2026-03-15T00:00:00Z",
    });

    const result = await runDiscovery(
      {
        keyword: "software engineer",
        location: "Sydney",
        sources: ["linkedin"],
        careerDiscovery: true,
      },
      {
        sourceFactories: {
          linkedin: () => ({
            name: "linkedin",
            discoverJobs: async () => [linkedInJob],
          }),
        },
        atsCrawlerFactories: {
          greenhouse: () => ({
            name: "greenhouse",
            crawlJobs,
          }),
        },
        careerDiscoverer: {
          discover: async () => ({
            companyName: "Example Co",
            inferredDomain: "example.com",
            probedUrls: ["https://example.com/careers"],
            atsType: "greenhouse",
            companyIdentifier: "example",
            applyUrl: "https://boards.greenhouse.io/example/jobs/1",
            outcome: "ats_detected",
          }),
        },
        extractedAt: () => "2026-03-15T00:00:00Z",
      },
    );

    expect(crawlJobs).toHaveBeenCalledTimes(1);
    expect(result.expandedCompanies).toEqual(["greenhouse:example"]);
    expect(result.jobs[0]).toMatchObject({
      atsType: "greenhouse",
      atsIdentifier: "example",
      externalUrl: "https://boards.greenhouse.io/example/jobs/1",
    });
  });

  it("does not run fallback for linkedin_easy_apply when onlyUnknown is enabled", async () => {
    const discover = vi.fn(async () => ({
      companyName: "Example Co",
      inferredDomain: "example.com",
      probedUrls: [],
      atsType: "greenhouse",
      companyIdentifier: "example",
      applyUrl: "https://boards.greenhouse.io/example/jobs/1",
      outcome: "ats_detected",
    }));
    const linkedInJob = createEmptyDiscoveryJob({
      id: "li-1",
      source: "linkedin",
      title: "Software Engineer",
      company: "Example Co",
      location: "Sydney",
      description: "Role description.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      extractedAt: "2026-03-15T00:00:00Z",
    });
    linkedInJob.atsType = "linkedin_easy_apply";

    await runDiscovery(
      {
        keyword: "software engineer",
        location: "Sydney",
        sources: ["linkedin"],
        careerDiscovery: true,
        careerDiscoveryOnlyUnknown: true,
      },
      {
        sourceFactories: {
          linkedin: () => ({
            name: "linkedin",
            discoverJobs: async () => [linkedInJob],
          }),
        },
        atsCrawlerFactories: {},
        careerDiscoverer: { discover },
        extractedAt: () => "2026-03-15T00:00:00Z",
      },
    );

    expect(discover).not.toHaveBeenCalled();
  });

  it("passes the original search location into career discovery", async () => {
    const discover = vi.fn(async () => ({
      companyName: "Example Co",
      inferredDomain: "example.com",
      probedUrls: [],
      atsType: "unknown",
      companyIdentifier: null,
      applyUrl: null,
      outcome: "no_ats_detected",
    }));
    const linkedInJob = createEmptyDiscoveryJob({
      id: "li-1",
      source: "linkedin",
      title: "Software Engineer",
      company: "Example Co",
      location: "",
      description: "Role description.",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      extractedAt: "2026-03-15T00:00:00Z",
    });

    await runDiscovery(
      {
        keyword: "software engineer",
        location: "Australia",
        sources: ["linkedin"],
        careerDiscovery: true,
      },
      {
        sourceFactories: {
          linkedin: () => ({
            name: "linkedin",
            discoverJobs: async () => [linkedInJob],
          }),
        },
        atsCrawlerFactories: {},
        careerDiscoverer: { discover },
        extractedAt: () => "2026-03-15T00:00:00Z",
      },
    );

    expect(discover).toHaveBeenCalledWith({
      companyName: "Example Co",
      location: "Australia",
    });
  });
});
