import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildLiveParityReport,
  runLiveParitySmoke,
  summarizeDiscoveryJobs,
  writeLiveParityReport,
  type LiveParityRequest,
  type LiveParityEngineSummary,
} from "../../../src/discovery/parity/live-smoke.js";
import { createEmptyDiscoveryJob } from "../../../src/discovery/core/types.js";

describe("buildLiveParityReport", () => {
  it("records field-level divergences without failing the whole smoke report", () => {
    const tsSummary: LiveParityEngineSummary = {
      totalJobs: 10,
      postedAtCount: 10,
      externalUrlCount: 2,
      atsBreakdown: {
        ashby: 1,
        linkedin_easy_apply: 3,
        unknown: 6,
      },
      firstJobIds: ["1", "2", "3"],
      externalJobs: [
        {
          jobId: "1",
          title: "Full Stack Engineer",
          company: "Example",
          externalUrl: "https://jobs.lever.co/example/1",
          atsType: "lever",
        },
      ],
    };

    const pythonSummary: LiveParityEngineSummary = {
      totalJobs: 10,
      postedAtCount: 10,
      externalUrlCount: 0,
      atsBreakdown: {
        linkedin_easy_apply: 3,
        unknown: 7,
      },
      firstJobIds: ["1", "2", "3"],
      externalJobs: [],
    };

    const report = buildLiveParityReport({
      generatedAt: "2026-03-16T00:00:00Z",
      request: {
        keyword: "full stack",
        location: "Sydney",
        pages: 1,
        minDelay: 1.2,
        maxDelay: 1.8,
        sources: ["linkedin"],
      },
      tsSummary,
      pythonSummary,
    });

    expect(report.status).toBe("diverged");
    expect(report.differences).toEqual([
      "externalUrlCount",
      "atsBreakdown",
      "externalJobs",
    ]);
    expect(report.request).toMatchObject({
      keyword: "full stack",
      location: "Sydney",
      pages: 1,
    });
    expect(report.ts.externalUrlCount).toBe(2);
    expect(report.python.externalUrlCount).toBe(0);
  });
});

describe("writeLiveParityReport", () => {
  it("writes a JSON report file and returns its path", () => {
    const reportPath = join(
      mkdtempSync(join(tmpdir(), "jobjourney-live-parity-")),
      "report.json",
    );

    const returnedPath = writeLiveParityReport(
      {
        generatedAt: "2026-03-16T00:00:00Z",
        request: {
          keyword: "full stack",
          location: "Sydney",
          pages: 1,
          minDelay: 1.2,
          maxDelay: 1.8,
          sources: ["linkedin"],
        },
        status: "matched",
        differences: [],
        ts: {
          totalJobs: 10,
          postedAtCount: 10,
          externalUrlCount: 2,
          atsBreakdown: { unknown: 8 },
          firstJobIds: ["1"],
          externalJobs: [],
        },
        python: {
          totalJobs: 10,
          postedAtCount: 10,
          externalUrlCount: 2,
          atsBreakdown: { unknown: 8 },
          firstJobIds: ["1"],
          externalJobs: [],
        },
      },
      reportPath,
    );

    expect(returnedPath).toBe(reportPath);
    expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
      status: "matched",
      differences: [],
    });
  });
});

describe("runLiveParitySmoke", () => {
  it("stores TS jobs in the main DB flow by default", async () => {
    const persisted: Array<{
      jobs: Array<{ id: string; source: string }>;
      request: LiveParityRequest;
    }> = [];

    const result = await runLiveParitySmoke({
      keyword: "full stack",
      location: "Sydney",
      pages: 1,
      reportPath: join(
        mkdtempSync(join(tmpdir(), "jobjourney-live-parity-store-")),
        "report.json",
      ),
      generatedAt: () => "2026-03-16T00:00:00Z",
      executeTsRun: async () => [
        createEmptyDiscoveryJob({
          id: "linkedin-1",
          source: "linkedin",
          title: "Full Stack Engineer",
          company: "Example",
          location: "Sydney",
          description: "React and AWS",
          jobUrl: "https://www.linkedin.com/jobs/view/1",
          extractedAt: "2026-03-16T00:00:00Z",
          postedAt: "2026-03-15",
        }),
      ],
      executePythonRun: async () => ({
        totalJobs: 1,
        postedAtCount: 1,
        externalUrlCount: 0,
        atsBreakdown: { unknown: 1 },
        firstJobIds: ["linkedin-1"],
        externalJobs: [],
      }),
      storeTsJobs: async (jobs, request) => {
        persisted.push({
          jobs: jobs.map((job) => ({ id: job.id, source: job.source })),
          request,
        });
      },
    });

    expect(result.report.status).toBe("matched");
    expect(persisted).toEqual([
      {
        jobs: [{ id: "linkedin-1", source: "linkedin" }],
        request: {
          keyword: "full stack",
          location: "Sydney",
          pages: 1,
          minDelay: 1.2,
          maxDelay: 1.8,
          sources: ["linkedin"],
        },
      },
    ]);
  });
});

describe("summarizeDiscoveryJobs", () => {
  it("counts only primary linkedin listings for live parity summaries", () => {
    const primary = createEmptyDiscoveryJob({
      id: "linkedin-1",
      source: "linkedin",
      title: "Full Stack Engineer",
      company: "Example",
      location: "Sydney",
      description: "",
      jobUrl: "https://www.linkedin.com/jobs/view/1",
      extractedAt: "2026-03-16T00:00:00Z",
    });
    const expanded = createEmptyDiscoveryJob({
      id: "lever-1",
      source: "linkedin",
      title: "Expanded ATS Job",
      company: "Example",
      location: "Sydney",
      description: "",
      jobUrl: "https://jobs.lever.co/example/1",
      extractedAt: "2026-03-16T00:00:00Z",
    });
    expanded.externalUrl = "https://jobs.lever.co/example/1";
    expanded.atsType = "lever";

    const summary = summarizeDiscoveryJobs([primary, expanded], "linkedin");

    expect(summary).toMatchObject({
      totalJobs: 1,
      externalUrlCount: 0,
      firstJobIds: ["linkedin-1"],
      externalJobs: [],
    });
  });
});
