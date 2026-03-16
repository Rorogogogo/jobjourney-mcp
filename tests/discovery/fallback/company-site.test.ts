import { describe, expect, it, vi } from "vitest";
import {
  CompanyCareerDiscoverer,
  getCachedCareerDiscoveryResult,
  inferCompanyDomains,
  shouldRunCareerDiscovery,
} from "../../../src/discovery/fallback/company-site.js";

class FakeResponse {
  constructor(
    readonly url: string,
    readonly text: string,
  ) {}
}

class FakeHttpClient {
  readonly calls: string[] = [];

  constructor(private readonly responses: Record<string, object>) {}

  async get(url: string): Promise<FakeResponse> {
    this.calls.push(url);
    const response = this.responses[url];
    if (response instanceof Error) {
      throw response;
    }
    if (!response) {
      throw new Error(`unexpected url: ${url}`);
    }
    return response as FakeResponse;
  }
}

describe("inferCompanyDomains", () => {
  it("returns bounded candidates including location-aware TLDs", () => {
    const domains = inferCompanyDomains("Example Co", "Sydney, Australia", 5);

    expect(domains.length).toBeLessThanOrEqual(5);
    expect(domains).toContain("example.com");
    expect(domains).toContain("example.com.au");
  });
});

describe("CompanyCareerDiscoverer", () => {
  it("discovers ATS from redirected career pages", async () => {
    const discoverer = new CompanyCareerDiscoverer(
      new FakeHttpClient({
        "https://example.com/careers": new FakeResponse(
          "https://boards.greenhouse.io/example",
          "<html></html>",
        ),
      }),
      {
        careerPaths: ["/careers"],
        maxProbes: 2,
      },
    );

    const result = await discoverer.discover({
      companyName: "Example Co",
      location: "Australia",
    });

    expect(result).toMatchObject({
      atsType: "greenhouse",
      companyIdentifier: "example",
      applyUrl: "https://boards.greenhouse.io/example",
      outcome: "ats_detected",
      probedUrls: ["https://example.com/careers"],
    });
  });

  it("discovers ATS from embedded page URLs", async () => {
    const discoverer = new CompanyCareerDiscoverer(
      new FakeHttpClient({
        "https://example.com/jobs": new FakeResponse(
          "https://example.com/jobs",
          `
            <html>
              <script>
                {"jobsUrl": "https://jobs.lever.co/netflix"}
              </script>
            </html>
          `,
        ),
      }),
      {
        careerPaths: ["/jobs"],
        maxProbes: 2,
      },
    );

    const result = await discoverer.discover({
      companyName: "Example Co",
      location: "Australia",
    });

    expect(result).toMatchObject({
      atsType: "lever",
      companyIdentifier: "netflix",
      applyUrl: "https://jobs.lever.co/netflix",
      outcome: "ats_detected",
    });
  });

  it("respects max probes", async () => {
    const httpClient = new FakeHttpClient({
      "https://example.com/careers": new FakeResponse(
        "https://example.com/careers",
        "<html></html>",
      ),
      "https://example.com/jobs": new FakeResponse(
        "https://boards.greenhouse.io/example",
        "<html></html>",
      ),
    });
    const discoverer = new CompanyCareerDiscoverer(httpClient, {
      careerPaths: ["/careers", "/jobs"],
      maxProbes: 1,
    });

    const result = await discoverer.discover({
      companyName: "Example Co",
      location: "Australia",
    });

    expect(result.outcome).toBe("probe_limit_reached");
    expect(httpClient.calls).toHaveLength(1);
    expect(result.applyUrl).toBeNull();
  });
});

describe("career discovery gating", () => {
  it("skips linkedin_easy_apply when onlyUnknown is enabled", () => {
    expect(
      shouldRunCareerDiscovery({
        enabled: true,
        onlyUnknown: true,
        applyUrl: null,
        atsType: "linkedin_easy_apply",
      }),
    ).toBe(false);
  });

  it("allows unknown jobs with no external URL", () => {
    expect(
      shouldRunCareerDiscovery({
        enabled: true,
        onlyUnknown: true,
        applyUrl: null,
        atsType: "unknown",
      }),
    ).toBe(true);
  });

  it("disables fallback when an external URL already exists", () => {
    expect(
      shouldRunCareerDiscovery({
        enabled: true,
        onlyUnknown: false,
        applyUrl: "https://boards.greenhouse.io/example",
        atsType: "greenhouse",
      }),
    ).toBe(false);
  });
});

describe("career discovery cache", () => {
  it("reuses previous company results", async () => {
    const discover = vi.fn(async () => ({
      companyName: "Microsoft",
      inferredDomain: "microsoft.com",
      probedUrls: [],
      atsType: "unknown",
      companyIdentifier: null,
      applyUrl: null,
      outcome: "no_ats_detected",
    }));

    const cache = new Map<string, object>();
    const first = await getCachedCareerDiscoveryResult({
      cache,
      companyName: "Microsoft",
      location: "Sydney, Australia",
      atsType: "unknown",
      careerDiscoverer: { discover },
      logger: () => {},
    });
    const second = await getCachedCareerDiscoveryResult({
      cache,
      companyName: "Microsoft",
      location: "Melbourne, Australia",
      atsType: "unknown",
      careerDiscoverer: { discover },
      logger: () => {},
    });

    expect(discover).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
