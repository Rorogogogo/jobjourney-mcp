import { describe, expect, it } from "vitest";
import {
  detectAts,
  extractKnownAtsUrls,
  normalizeAtsUrlCandidate,
} from "../../../src/discovery/ats/detector.js";

describe("detectAts", () => {
  it("detects greenhouse company identifiers from direct URLs", () => {
    expect(detectAts("https://boards.greenhouse.io/stripe/jobs/123")).toEqual({
      atsType: "greenhouse",
      companyIdentifier: "stripe",
      domain: "boards.greenhouse.io",
      applyUrl: "https://boards.greenhouse.io/stripe/jobs/123",
    });
  });

  it("detects lever company identifiers from direct URLs", () => {
    expect(detectAts("https://jobs.lever.co/netflix/abc123")).toEqual({
      atsType: "lever",
      companyIdentifier: "netflix",
      domain: "jobs.lever.co",
      applyUrl: "https://jobs.lever.co/netflix/abc123",
    });
  });

  it("classifies missing URLs as LinkedIn easy apply when flagged", () => {
    expect(detectAts(null, { easyApply: true })).toEqual({
      atsType: "linkedin_easy_apply",
      companyIdentifier: null,
      domain: "linkedin.com",
      applyUrl: null,
    });
  });

  it("unwraps LinkedIn redirect links before detection", () => {
    expect(
      detectAts(
        "https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fjobs.lever.co%2Fcanva%2Fabc",
      ),
    ).toEqual({
      atsType: "lever",
      companyIdentifier: "canva",
      domain: "jobs.lever.co",
      applyUrl: "https://jobs.lever.co/canva/abc",
    });
  });
});

describe("ATS URL helpers", () => {
  it("extracts ATS URLs from raw HTML fragments", () => {
    const urls = extractKnownAtsUrls(`
      <script>
        window.__TEST__ = "https://boards.greenhouse.io/exampleco/jobs/456";
      </script>
    `);

    expect(urls).toEqual(["https://boards.greenhouse.io/exampleco/jobs/456"]);
  });

  it("normalizes only known ATS URL candidates", () => {
    expect(normalizeAtsUrlCandidate("https://jobs.lever.co/example/abc")).toBe(
      "https://jobs.lever.co/example/abc",
    );
    expect(normalizeAtsUrlCandidate("https://example.com/careers")).toBeNull();
  });
});
