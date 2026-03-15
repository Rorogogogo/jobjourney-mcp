import { describe, expect, it } from "vitest";
import { parseLinkedInGuestJobDetail } from "../../../src/discovery/sources/linkedin-guest.js";

describe("parseLinkedInGuestJobDetail", () => {
  it("extracts external apply URL from an apply anchor", () => {
    const html = `
      <div>
        <h2 class="top-card-layout__title">Software Engineer</h2>
        <a class="topcard__org-name-link">Example Co</a>
        <span class="topcard__flavor--bullet">Sydney, Australia</span>
        <div class="show-more-less-html__markup">Build things.</div>
        <a class="apply-button" href="https://boards.greenhouse.io/example/jobs/123">
          Apply
        </a>
      </div>
    `;

    const detail = parseLinkedInGuestJobDetail(html, {
      jobId: "123",
      jobUrl: "https://www.linkedin.com/jobs/view/123",
    });

    expect(detail).toMatchObject({
      jobId: "123",
      title: "Software Engineer",
      company: "Example Co",
      location: "Sydney, Australia",
      description: "Build things.",
      applyUrl: "https://boards.greenhouse.io/example/jobs/123",
      isEasyApply: false,
      jobUrl: "https://www.linkedin.com/jobs/view/123",
    });
  });

  it("extracts external apply URL from data-apply-url", () => {
    const html = `
      <div>
        <h2 class="top-card-layout__title">Software Engineer</h2>
        <div class="apply-button" data-apply-url="https://jobs.lever.co/netflix/abc123">
          Apply
        </div>
      </div>
    `;

    const detail = parseLinkedInGuestJobDetail(html, { jobId: "123" });

    expect(detail.applyUrl).toBe("https://jobs.lever.co/netflix/abc123");
    expect(detail.isEasyApply).toBe(false);
  });

  it("extracts embedded ATS URLs from raw HTML", () => {
    const html = `
      <div>
        <h2 class="top-card-layout__title">Software Engineer</h2>
        <script type="application/json">
          {"applyUrl": "https://boards.greenhouse.io/exampleco/jobs/456"}
        </script>
      </div>
    `;

    const detail = parseLinkedInGuestJobDetail(html, { jobId: "123" });

    expect(detail.applyUrl).toBe("https://boards.greenhouse.io/exampleco/jobs/456");
    expect(detail.isEasyApply).toBe(false);
  });

  it("marks onsite LinkedIn apply when no external URL exists", () => {
    const html = `
      <div>
        <button
          class="apply-button apply-button--default"
          data-tracking-control-name="public_jobs_apply-link-onsite"
        >
          Apply
        </button>
      </div>
    `;

    const detail = parseLinkedInGuestJobDetail(html, { jobId: "123" });

    expect(detail.applyUrl).toBeNull();
    expect(detail.isEasyApply).toBe(true);
  });

  it("extracts applicant count from top card metadata", () => {
    const html = `
      <div>
        <div class="topcard__flavor-row">
          <figure class="num-applicants__figure topcard__flavor--metadata topcard__flavor--bullet">
            <figcaption class="num-applicants__caption">
              Over 200 applicants
            </figcaption>
          </figure>
        </div>
      </div>
    `;

    const detail = parseLinkedInGuestJobDetail(html, { jobId: "123" });

    expect(detail.applicantCount).toBe("Over 200 applicants");
  });
});
