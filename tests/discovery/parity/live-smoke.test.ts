import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildLiveParityReport,
  writeLiveParityReport,
  type LiveParityEngineSummary,
} from "../../../src/discovery/parity/live-smoke.js";

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
