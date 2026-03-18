import { describe, expect, it } from "vitest";
import { createEmptyDiscoveryJob } from "../../../src/discovery/core/types.js";
import {
  enrichDiscoveryJob,
  extractSalary,
  normalizeSalary,
} from "../../../src/discovery/analysis/enrichment.js";

describe("normalizeSalary", () => {
  it("parses yearly range from html-wrapped lever salary", () => {
    const result = normalizeSalary(
      "<div>Base $70,000 - $80,000 per year depending on experience + Commission</div>",
    );

    expect(result.raw).toBe(
      "Base $70,000 - $80,000 per year depending on experience + Commission",
    );
    expect(result.minimum).toBe("70000");
    expect(result.maximum).toBe("80000");
    expect(result.currency).toBe("$");
    expect(result.period).toBe("year");
  });

  it("parses daily range without collapsing to first token", () => {
    const result = normalizeSalary("€500 - €700 per day");

    expect(result.raw).toBe("€500 - €700 per day");
    expect(result.minimum).toBe("500");
    expect(result.maximum).toBe("700");
    expect(result.currency).toBe("€");
    expect(result.period).toBe("day");
  });

  it("parses hourly salary", () => {
    const result = normalizeSalary("$45/hour");

    expect(result.raw).toBe("$45/hour");
    expect(result.minimum).toBe("45");
    expect(result.maximum).toBe("45");
    expect(result.currency).toBe("$");
    expect(result.period).toBe("hour");
  });

  it("keeps ambiguous currency fragments without forcing a period", () => {
    const result = normalizeSalary("$1.9");

    expect(result.raw).toBe("$1.9");
    expect(result.minimum).toBe("1.9");
    expect(result.maximum).toBe("1.9");
    expect(result.currency).toBe("$");
    expect(result.period).toBe("unknown");
  });

  it("parses currency-code ranges", () => {
    const result = normalizeSalary("AUD 120,000 to AUD 140,000");

    expect(result.raw).toBe("AUD 120,000 to AUD 140,000");
    expect(result.minimum).toBe("120000");
    expect(result.maximum).toBe("140000");
    expect(result.currency).toBe("AUD");
    expect(result.period).toBe("unknown");
  });

  it("normalizes k-suffix salary ranges", () => {
    const result = normalizeSalary("$87k - $124k");

    expect(result.raw).toBe("$87k - $124k");
    expect(result.minimum).toBe("87000");
    expect(result.maximum).toBe("124000");
    expect(result.currency).toBe("$");
    expect(result.period).toBe("unknown");
  });
});

describe("extractSalary", () => {
  it("ignores funding amounts without salary context", () => {
    const result = extractSalary(`
      Blinq is growing quickly.
      Well-resourced: $45m+ raised from top investors.
      Customers love it.
    `);

    expect(result).toBeNull();
  });

  it("keeps contextual single salary amounts", () => {
    expect(extractSalary("Salary: $120,000 per year plus equity")).toBe(
      "$120,000 per year",
    );
  });

  it("keeps k-suffix salary ranges", () => {
    expect(
      extractSalary(
        "This role sits within a salary range of ($87k - $124k) + 12% superannuation.",
      ),
    ).toBe("$87k - $124k");
  });

  it("ignores non-salary budget amounts", () => {
    expect(
      extractSalary("A generous personal development budget of $500 per annum"),
    ).toBeNull();
  });
});

describe("enrichDiscoveryJob", () => {
  it("preserves structured salary fields when raw salary text has no amount", () => {
    const job = createEmptyDiscoveryJob({
      id: "lever-1",
      source: "lever",
      title: "Mid-Market Account Executive",
      company: "blinq",
      location: "Sydney",
      description: "Sell software.",
      jobUrl: "https://jobs.lever.co/blinq/1",
      extractedAt: "2026-03-15T00:00:00+00:00",
    });
    job.externalUrl = "https://jobs.lever.co/blinq/1";
    job.atsType = "lever";
    job.salary = "Un-capped commission structure + 401K benefit";
    job.salaryMin = "100000";
    job.salaryMax = "150000";
    job.salaryCurrency = "USD";
    job.salaryPeriod = "year";

    const enriched = enrichDiscoveryJob(job);

    expect(enriched.salaryRaw).toBe("Un-capped commission structure + 401K benefit");
    expect(enriched.salaryMin).toBe("100000");
    expect(enriched.salaryMax).toBe("150000");
    expect(enriched.salaryCurrency).toBe("USD");
    expect(enriched.salaryPeriod).toBe("year");
  });
});
