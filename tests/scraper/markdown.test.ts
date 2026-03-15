import { describe, expect, it } from "vitest";
import { renderMarkdownReport } from "../../src/scraper/core/markdown.js";

describe("renderMarkdownReport", () => {
  it("renders scraped jobs as markdown", () => {
    const markdown = renderMarkdownReport([
      {
        title: "AI Engineer",
        company: "Canva",
        location: "Sydney",
        url: "https://example.com/job",
        source: "seek",
        scrapedAt: "2026-03-14T00:00:00.000Z",
      },
    ]);

    expect(markdown).toContain("# Job Results");
    expect(markdown).toContain("## AI Engineer");
    expect(markdown).toContain("- Company: Canva");
    expect(markdown).toContain("- Link: https://example.com/job");
  });

  it("handles empty results", () => {
    const markdown = renderMarkdownReport([]);
    expect(markdown).toContain("No jobs found");
  });

  it("renders multiple jobs", () => {
    const markdown = renderMarkdownReport([
      {
        title: "Job A",
        company: "Co A",
        location: "Sydney",
        url: "https://a.com",
        source: "seek",
        scrapedAt: "2026-01-01",
      },
      {
        title: "Job B",
        company: "Co B",
        location: "Melbourne",
        url: "https://b.com",
        source: "linkedin",
        scrapedAt: "2026-01-01",
      },
    ]);
    expect(markdown).toContain("## Job A");
    expect(markdown).toContain("## Job B");
  });
});
