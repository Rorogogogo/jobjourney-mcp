import { describe, expect, it } from "vitest";
import { parseLinkedInGuestSearchResults } from "../../../src/discovery/sources/linkedin-guest.js";

describe("parseLinkedInGuestSearchResults", () => {
  it("extracts job cards and postedAt from guest search HTML", () => {
    const html = `
      <li>
        <div class="base-card base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:123">
          <a class="base-card__full-link" href="/jobs/view/123"></a>
          <div class="base-search-card__info">
            <h3 class="base-search-card__title">Software Engineer</h3>
            <h4 class="base-search-card__subtitle">
              <a class="hidden-nested-link">Example Co</a>
            </h4>
            <div class="base-search-card__metadata">
              <span class="job-search-card__location">Sydney, Australia</span>
              <time class="job-search-card__listdate" datetime="2025-07-01">8 months ago</time>
            </div>
          </div>
        </div>
      </li>
    `;

    const results = parseLinkedInGuestSearchResults(html);

    expect(results).toEqual([
      {
        jobId: "123",
        title: "Software Engineer",
        company: "Example Co",
        location: "Sydney, Australia",
        jobUrl: "https://www.linkedin.com/jobs/view/123",
        postedAt: "2025-07-01",
        companyLogoUrl: "",
      },
    ]);
  });

  it("extracts company logo URL from search card", () => {
    const html = `
      <li>
        <div class="base-card" data-entity-urn="urn:li:jobPosting:456">
          <a class="base-card__full-link" href="/jobs/view/456"></a>
          <img class="artdeco-entity-image" data-delayed-url="https://media.licdn.com/dms/image/v2/logo.jpg" />
          <div class="base-search-card__info">
            <h3 class="base-search-card__title">Product Manager</h3>
            <h4 class="base-search-card__subtitle">
              <a class="hidden-nested-link">Acme Corp</a>
            </h4>
            <span class="job-search-card__location">Melbourne, Australia</span>
          </div>
        </div>
      </li>
    `;

    const results = parseLinkedInGuestSearchResults(html);

    expect(results[0].companyLogoUrl).toBe("https://media.licdn.com/dms/image/v2/logo.jpg");
  });
});
