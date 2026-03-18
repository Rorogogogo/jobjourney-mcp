export const DEFAULT_PARITY_CASES = [
    {
        id: "linkedin-search-basic",
        kind: "linkedin_search_results",
        input: {
            html: `
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
      `,
        },
    },
    {
        id: "linkedin-detail-apply-anchor",
        kind: "linkedin_job_detail",
        input: {
            html: `
        <div>
          <h2 class="top-card-layout__title">Software Engineer</h2>
          <a class="topcard__org-name-link">Example Co</a>
          <span class="topcard__flavor--bullet">Sydney, Australia</span>
          <div class="show-more-less-html__markup">Build things.</div>
          <a class="apply-button" href="https://boards.greenhouse.io/example/jobs/123">
            Apply
          </a>
        </div>
      `,
            jobId: "123",
            jobUrl: "https://www.linkedin.com/jobs/view/123",
        },
    },
    {
        id: "linkedin-detail-data-apply-url",
        kind: "linkedin_job_detail",
        input: {
            html: `
        <div>
          <h2 class="top-card-layout__title">Software Engineer</h2>
          <div class="apply-button" data-apply-url="https://jobs.lever.co/netflix/abc123">
            Apply
          </div>
        </div>
      `,
            jobId: "123",
        },
    },
    {
        id: "linkedin-detail-embedded-ats",
        kind: "linkedin_job_detail",
        input: {
            html: `
        <div>
          <h2 class="top-card-layout__title">Software Engineer</h2>
          <script type="application/json">
            {"applyUrl": "https://boards.greenhouse.io/exampleco/jobs/456"}
          </script>
        </div>
      `,
            jobId: "123",
        },
    },
    {
        id: "ats-detection-linkedin-redirect",
        kind: "ats_detection",
        input: {
            applyUrl: "https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fjobs.lever.co%2Fcanva%2Fabc",
            easyApply: false,
        },
    },
    {
        id: "salary-normalization-yearly-range",
        kind: "salary_normalization",
        input: {
            text: "<div>Base $70,000 - $80,000 per year depending on experience + Commission</div>",
        },
    },
];
