import type { Page } from "playwright";
import { launchBrowser, createAuthenticatedContext, saveCookies } from "../core/browser.js";
import type {
  ScrapeRequest,
  ScrapedJob,
  JobSourceScraper,
} from "../core/types.js";

const BASE_DELAY_MS = 800;
const JITTER_MS = 400;
const PAGE_NAV_DELAY_MS = 2000;
const ERROR_DELAY_MS = 2000;
const JOBS_PER_PAGE = 25;
const MAX_TOTAL_JOBS = 500;
const PANEL_INITIAL_WAIT_MS = 200;
const PANEL_MAX_WAIT_MS = 3000;
const PANEL_MAX_ATTEMPTS = 30;
const PANEL_BACKOFF_MULTIPLIER = 1.5;
const POST_PANEL_RENDER_MS = 500;
const RATE_LIMIT_WAIT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(): number {
  return BASE_DELAY_MS + Math.random() * JITTER_MS;
}

export class LinkedInScraper implements JobSourceScraper {
  async scrape(request: ScrapeRequest): Promise<ScrapedJob[]> {
    const browser = await launchBrowser();
    const context = await createAuthenticatedContext(browser, "linkedin");
    try {
      const page = await context.newPage();
      const maxPages = request.maxPages ?? 1;
      const allJobs: ScrapedJob[] = [];

      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        const url = buildLinkedInUrl(request.keyword, request.location, pageNum * JOBS_PER_PAGE);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (pageNum > 0) await sleep(PAGE_NAV_DELAY_MS);
        await scrollToLoadAll(page);

        const pageJobs = await scrapePageWithClickThrough(page);
        if (pageJobs.length === 0) break;
        allJobs.push(...pageJobs);

        if (allJobs.length >= MAX_TOTAL_JOBS) {
          allJobs.length = MAX_TOTAL_JOBS;
          break;
        }
      }
      // Save cookies after scraping (may have refreshed session)
      await saveCookies(context, "linkedin");
      return allJobs;
    } finally {
      await browser.close();
    }
  }
}

// Exported for fixture tests (basic card extraction only)
export async function scrapeLinkedInPage(
  page: Page,
  request: Pick<ScrapeRequest, "keyword" | "location">,
): Promise<ScrapedJob[]> {
  if (!page.url().startsWith("file://")) {
    const url = buildLinkedInUrl(request.keyword, request.location, 0);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await scrollToLoadAll(page);
  }
  return extractBasicJobsFromCards(page);
}

async function scrollToLoadAll(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await sleep(600 + Math.random() * 300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
}

async function scrapePageWithClickThrough(page: Page): Promise<ScrapedJob[]> {
  const cardSelector = 'div.job-card-job-posting-card-wrapper, li[data-occludable-job-id], div.base-card';

  await page.waitForSelector(cardSelector, { timeout: 15000 }).catch(() => null);

  const cards = await page.locator(cardSelector).all();
  const jobs: ScrapedJob[] = [];

  for (const card of cards.slice(0, 30)) {
    try {
      // 1. Scroll card into view
      await card.scrollIntoViewIfNeeded().catch(() => null);
      await sleep(100);

      // 2. Extract basic info from card
      const basicInfo = await extractBasicInfoFromCard(card);
      if (!basicInfo.title || !basicInfo.url) continue;

      // 3. Click the job card
      const clickTarget = card.locator('a.job-card-list__title--link, a[data-job-id], .artdeco-entity-lockup__title a, h3 a, a[href*="/jobs/view/"], a.base-card__full-link').first();
      await clickTarget.click().catch(() => card.click());

      // 4. Wait for detail panel with exponential backoff
      const panelLoaded = await waitForDetailPanel(page);

      if (panelLoaded) {
        // 5. Extract full details from panel
        const details = await extractDetailPanel(page, basicInfo);
        jobs.push(details);
      } else {
        jobs.push({
          ...basicInfo,
          source: "linkedin",
          scrapedAt: new Date().toISOString(),
        } as ScrapedJob);
      }

      await sleep(randomDelay());
    } catch {
      await sleep(ERROR_DELAY_MS);
    }
  }

  return jobs;
}

async function waitForDetailPanel(page: Page): Promise<boolean> {
  let waitTime = PANEL_INITIAL_WAIT_MS;

  for (let attempt = 0; attempt < PANEL_MAX_ATTEMPTS; attempt++) {
    await sleep(waitTime);

    // Check for rate limiting
    const rateLimited = await page.evaluate(() => {
      const error = document.querySelector(".artdeco-inline-feedback--error");
      return error?.textContent?.includes("429") ?? false;
    });

    if (rateLimited) {
      await sleep(RATE_LIMIT_WAIT_MS);
    }

    const loaded = await page.evaluate(() => {
      // Condition A: Modern layout
      const container = document.querySelector(".jobs-search__job-details--container");
      const mainContent = document.querySelector(".jobs-details__main-content");
      const loading = document.querySelector(".jobs-search__job-details--loading");
      if (container && mainContent && !loading) {
        const title = document.querySelector(".job-details-jobs-unified-top-card__job-title h1");
        if (title?.textContent?.trim()) return true;
      }

      // Condition B: Alternative layout
      const detail = document.querySelector(".scaffold-layout__detail");
      if (detail) {
        const title = document.querySelector(".job-details-jobs-unified-top-card__job-title h1");
        if (title?.textContent?.trim()) return true;
      }

      return false;
    });

    if (loaded) {
      await sleep(POST_PANEL_RENDER_MS);
      return true;
    }

    waitTime = Math.min(waitTime * PANEL_BACKOFF_MULTIPLIER, PANEL_MAX_WAIT_MS);
  }

  return false;
}

async function extractDetailPanel(
  page: Page,
  basicInfo: Partial<ScrapedJob>,
): Promise<ScrapedJob> {
  const details = await page.evaluate(() => {
    const getText = (selectors: string): string => {
      for (const sel of selectors.split(",")) {
        const el = document.querySelector(sel.trim());
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return "";
    };

    // Title
    const title = getText("h1.t-24, .job-details-jobs-unified-top-card__job-title h1, .jobs-details-top-card__job-title");

    // Company
    const company = getText("a.topcard__org-name-link, .job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name");

    // Location - from metadata spans
    let location = "";
    const metaContainer = document.querySelector(".jobs-unified-top-card__subtitle-primary-grouping, .job-details-jobs-unified-top-card__primary-description-container");
    if (metaContainer) {
      const spans = metaContainer.querySelectorAll('span[class*="tvm__text"]');
      for (let i = 1; i < spans.length; i++) {
        const text = spans[i].textContent?.trim() ?? "";
        if (text !== "·" && !/(ago|applicant|people clicked|promoted|responses managed)/i.test(text)) {
          location = text;
          break;
        }
      }
      if (!location) {
        const parts = (metaContainer.textContent ?? "").split("·");
        if (parts.length > 0) location = parts[0].trim();
      }
    }

    // Posted date
    let postedDate = "";
    if (metaContainer) {
      const spans = metaContainer.querySelectorAll("span");
      for (const span of spans) {
        const text = span.textContent?.trim() ?? "";
        if (/\d+\s+(day|week|month|year|hour|minute)s?\s+ago/i.test(text)) {
          postedDate = text;
          break;
        }
      }
    }

    // Applicant count
    let applicantCount = "";
    if (metaContainer) {
      const spans = metaContainer.querySelectorAll("span");
      for (const span of spans) {
        const text = span.textContent?.trim() ?? "";
        if (/applicant|people clicked apply/i.test(text)) {
          applicantCount = text;
          break;
        }
      }
    }

    // Description
    let description = "";
    const descSelectors = [
      ".jobs-description__content .jobs-box__html-content",
      ".jobs-description-content__text",
      "div#job-details",
      'div[class*="jobs-box__html-content"]',
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const inner = el.querySelector(".mt4") ?? el;
        description = (inner as HTMLElement).innerText?.replace(/\n{3,}/g, "\n\n").trim() ?? "";
        if (description) break;
      }
    }

    // Company logo
    const logoSelectors = [
      ".artdeco-entity-lockup__image img.evi-image",
      ".jobs-company img.evi-image",
      ".job-details-jobs-unified-top-card__container--two-pane .evi-image",
      ".jobs-unified-top-card__company-logo img",
      "img.evi-image",
    ];
    let companyLogoUrl = "";
    for (const sel of logoSelectors) {
      const img = document.querySelector(sel) as HTMLImageElement | null;
      if (img?.src) {
        companyLogoUrl = img.src;
        break;
      }
    }

    // Salary from pills
    let salary = "";
    const pills = document.querySelectorAll(".job-details-preferences-and-skills__pill, .job-details-jobs-unified-top-card__job-insight, .job-details-jobs-unified-top-card__workplace-type");
    for (const pill of pills) {
      const text = pill.textContent?.trim() ?? "";
      if (/[$€£¥₹]|salary|\/yr|\/hour|\/month|\/week|bonus|\d+K/i.test(text)) {
        salary = text.replace(/See how you compare.*/i, "").trim();
        break;
      }
    }
    if (!salary) {
      salary = getText(".compensation__salary-range, [class*=\"salary-\"], .jobs-unified-top-card__salary-info");
    }

    // Job type from pills
    let jobType = "";
    for (const pill of pills) {
      const text = pill.textContent?.trim() ?? "";
      const match = text.match(/\b(Full-time|Part-time|Contract|Temporary|Internship|Volunteer|Casual|Contractor)\b/i);
      if (match) {
        jobType = match[1];
        break;
      }
    }

    // Workplace type from pills
    let workplaceType = "";
    const wpPill = document.querySelector(".job-details-jobs-unified-top-card__workplace-type");
    if (wpPill?.textContent?.trim()) {
      workplaceType = wpPill.textContent.trim();
    } else {
      for (const pill of pills) {
        const text = pill.textContent?.trim() ?? "";
        if (/remote/i.test(text)) {
          workplaceType = "Remote";
          break;
        }
        if (/hybrid/i.test(text)) {
          workplaceType = "Hybrid";
          break;
        }
        if (/on.?site/i.test(text)) {
          workplaceType = "On-site";
          break;
        }
      }
    }

    // Job URL from title link
    let jobUrl = "";
    const titleLink = document.querySelector("h1.t-24 a, .job-details-jobs-unified-top-card__job-title h1 a") as HTMLAnchorElement | null;
    if (titleLink?.href) jobUrl = titleLink.href.split("?")[0];
    if (!jobUrl) jobUrl = window.location.href.split("?")[0];

    // Already applied
    let isAlreadyApplied = false;
    const appliedFeedback = document.querySelector(".artdeco-inline-feedback--success .artdeco-inline-feedback__message");
    if (appliedFeedback?.textContent?.toLowerCase().includes("applied")) {
      isAlreadyApplied = true;
    }
    if (!isAlreadyApplied) {
      const trackerLink = document.querySelector('a[href*="/jobs/tracker/applied/"]');
      if (trackerLink) isAlreadyApplied = true;
    }

    return {
      title,
      company,
      location,
      postedDate,
      applicantCount,
      description,
      companyLogoUrl,
      salary,
      jobType,
      workplaceType,
      jobUrl,
      isAlreadyApplied,
    };
  });

  return {
    title: details.title || basicInfo.title || "",
    company: details.company || basicInfo.company || "",
    location: details.location || basicInfo.location || "",
    url: details.jobUrl || basicInfo.url || "",
    source: "linkedin",
    description: details.description || undefined,
    salary: details.salary || undefined,
    postedDate: details.postedDate || undefined,
    jobType: details.jobType || undefined,
    workplaceType: details.workplaceType || undefined,
    companyLogoUrl: details.companyLogoUrl || undefined,
    applicantCount: details.applicantCount || undefined,
    isAlreadyApplied: details.isAlreadyApplied || undefined,
    scrapedAt: new Date().toISOString(),
  };
}

async function extractBasicInfoFromCard(
  card: ReturnType<Page["locator"]>,
): Promise<Partial<ScrapedJob>> {
  const title =
    (await card.locator(".artdeco-entity-lockup__title, a.base-card__full-link, .base-search-card__title").first().textContent()) ?? "";
  const company =
    (await card.locator(".artdeco-entity-lockup__subtitle, .base-search-card__subtitle").first().textContent()) ?? "";
  const location =
    (await card.locator('span[class*="tvm__text"], .job-search-card__location').first().textContent()) ?? "";
  const linkEl = card.locator("a.job-card-list__title--link, a.base-card__full-link, .artdeco-entity-lockup__title a").first();
  const href = (await linkEl.getAttribute("href").catch(() => null)) ?? "";
  const url = href.startsWith("http") ? href.split("?")[0] : href ? `https://www.linkedin.com${href.split("?")[0]}` : "";

  return {
    title: title.trim(),
    company: company.trim(),
    location: location.trim(),
    url,
  };
}

async function extractBasicJobsFromCards(page: Page): Promise<ScrapedJob[]> {
  const cardSelector = 'div.job-card-job-posting-card-wrapper, li[data-occludable-job-id], div.base-card';
  await page.waitForSelector(cardSelector, { timeout: 15000 }).catch(() => null);

  const cards = await page.locator(cardSelector).all();
  const jobs: ScrapedJob[] = [];

  for (const card of cards.slice(0, 30)) {
    try {
      const info = await extractBasicInfoFromCard(card);
      if (info.title && info.url) {
        jobs.push({
          title: info.title,
          company: info.company ?? "",
          location: info.location ?? "",
          url: info.url,
          source: "linkedin",
          scrapedAt: new Date().toISOString(),
        });
      }
    } catch {
      // skip
    }
  }
  return jobs;
}

function buildLinkedInUrl(keyword: string, location: string, start: number): string {
  const params = new URLSearchParams({ keywords: keyword, location });
  if (start > 0) params.set("start", String(start));
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

