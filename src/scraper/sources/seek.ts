import type { Page } from "playwright";
import { launchBrowser, createAuthenticatedContext, saveCookies } from "../core/browser.js";
import type {
  ScrapeRequest,
  ScrapedJob,
  JobSourceScraper,
} from "../core/types.js";

const BASE_DELAY_MS = 300;
const PAGE_NAV_DELAY_MS = 1500;
const ERROR_DELAY_MS = 1500;
const MAX_TOTAL_JOBS = 500;
const PANEL_INITIAL_WAIT_MS = 200;
const PANEL_MAX_WAIT_MS = 3000;
const PANEL_MAX_ATTEMPTS = 25;
const PANEL_BACKOFF_MULTIPLIER = 1.5;
const POST_PANEL_RENDER_MS = 500;
const PAGE_MAX_RETRIES = 3;
const PAGE_RETRY_DELAY_MS = 3000;
const TOTAL_SCRAPE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const CARD_TIMEOUT_MS = 30_000; // 30 seconds per card

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SeekScraper implements JobSourceScraper {
  async scrape(request: ScrapeRequest): Promise<ScrapedJob[]> {
    const browser = await launchBrowser();
    const context = await createAuthenticatedContext(browser, "seek");
    const scrapeStart = Date.now();
    try {
      const page = await context.newPage();
      const maxPages = request.maxPages ?? 1;
      const allJobs: ScrapedJob[] = [];

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        if (Date.now() - scrapeStart > TOTAL_SCRAPE_TIMEOUT_MS) break;

        const url = buildSeekUrl(request.keyword, request.location, pageNum);
        let pageJobs: ScrapedJob[] = [];

        for (let retry = 0; retry <= PAGE_MAX_RETRIES; retry++) {
          if (Date.now() - scrapeStart > TOTAL_SCRAPE_TIMEOUT_MS) break;

          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          if (pageNum > 1 || retry > 0) await sleep(PAGE_NAV_DELAY_MS);
          await scrollToBottom(page);

          const blocked = await isPageBlocked(page);
          if (blocked && retry < PAGE_MAX_RETRIES) {
            await sleep(PAGE_RETRY_DELAY_MS * Math.pow(2, retry));
            continue;
          }

          pageJobs = await scrapePageWithClickThrough(page, scrapeStart);
          if (pageJobs.length === 0 && retry < PAGE_MAX_RETRIES) {
            await sleep(PAGE_RETRY_DELAY_MS * Math.pow(2, retry));
            continue;
          }
          break;
        }

        if (pageJobs.length === 0) break;
        allJobs.push(...pageJobs);

        if (allJobs.length >= MAX_TOTAL_JOBS) {
          allJobs.length = MAX_TOTAL_JOBS;
          break;
        }
      }
      // Save cookies after scraping (may have refreshed session)
      await saveCookies(context, "seek");
      return allJobs;
    } finally {
      await browser.close();
    }
  }
}

// Exported for tests using HTML fixtures (no click-through, just card extraction)
export async function scrapeSeekPage(
  page: Page,
  request: Pick<ScrapeRequest, "keyword" | "location">,
): Promise<ScrapedJob[]> {
  if (!page.url().startsWith("file://")) {
    const url = buildSeekUrl(request.keyword, request.location, 1);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await scrollToBottom(page);
  }
  return extractBasicJobsFromCards(page);
}

async function isPageBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = document.body?.textContent?.toLowerCase() ?? "";
    return (
      body.includes("access denied") ||
      body.includes("rate limit") ||
      body.includes("too many requests") ||
      body.includes("captcha") ||
      body.includes("please verify") ||
      document.querySelector('[data-automation="errorPage"]') !== null
    );
  });
}

async function scrollToBottom(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await sleep(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
}

async function scrapePageWithClickThrough(page: Page, scrapeStart: number): Promise<ScrapedJob[]> {
  await page
    .waitForSelector('[data-testid="job-card"], article[data-card-type="JobCard"]', { timeout: 15000 })
    .catch(() => null);

  const cards = await page
    .locator('[data-testid="job-card"], article[data-card-type="JobCard"]')
    .all();

  const jobs: ScrapedJob[] = [];

  for (const card of cards.slice(0, 30)) {
    if (Date.now() - scrapeStart > TOTAL_SCRAPE_TIMEOUT_MS) break;

    try {
      const cardJob = await withTimeout(
        processCard(page, card),
        CARD_TIMEOUT_MS,
      );
      if (cardJob) {
        jobs.push(cardJob);
      }
      await sleep(BASE_DELAY_MS);
    } catch {
      await sleep(ERROR_DELAY_MS);
    }
  }

  return jobs;
}

async function processCard(
  page: Page,
  card: ReturnType<Page["locator"]>,
): Promise<ScrapedJob | null> {
  // 1. Extract basic info from card
  const basicInfo = await extractBasicInfoFromCard(card);
  if (!basicInfo.title || !basicInfo.url) return null;

  // 2. Click the job card to open detail panel
  const clickTarget = card.locator('[data-testid="job-card-title"], a[data-automation="jobTitle"]').first();
  await clickTarget.click().catch(() => card.click());

  // 3. Wait for detail panel with exponential backoff
  const panelLoaded = await waitForDetailPanel(page);

  if (panelLoaded) {
    // 4. Extract full details from panel
    return extractDetailPanel(page, basicInfo);
  }

  // Fallback to basic info
  return {
    title: basicInfo.title || "",
    company: basicInfo.company || "",
    location: basicInfo.location || "",
    url: basicInfo.url || "",
    source: "seek",
    scrapedAt: new Date().toISOString(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Card timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function waitForDetailPanel(page: Page): Promise<boolean> {
  let waitTime = PANEL_INITIAL_WAIT_MS;

  for (let attempt = 0; attempt < PANEL_MAX_ATTEMPTS; attempt++) {
    await sleep(waitTime);

    const loaded = await page.evaluate(() => {
      const panel = document.querySelector('[data-automation="jobDetailsPage"]');
      const spinner = document.querySelector('[data-automation="loading-spinner"]');
      return panel !== null && spinner === null;
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

    const title = getText('[data-automation="job-detail-title"], h1');
    const company = getText('[data-automation="advertiser-name"]');
    const location = getText('[data-automation="job-detail-location"]');
    const jobType = getText('[data-automation="job-detail-work-type"]');
    const salary = getText('[data-automation="job-detail-salary"]');

    // Description
    const descEl = document.querySelector('[data-automation="jobAdDetails"]');
    const description = descEl ? (descEl as HTMLElement).innerText.replace(/\n{3,}/g, "\n\n").trim() : "";

    // Company logo
    const logoEl = document.querySelector('[data-testid="bx-logo-image"] img, [data-automation="advertiser-logo"] img') as HTMLImageElement | null;
    const companyLogoUrl = logoEl?.src ?? "";

    // Workplace type from card or panel
    const workArrangement = getText('[data-testid="work-arrangement"]');
    let workplaceType = "";
    if (/remote/i.test(workArrangement)) workplaceType = "Remote";
    else if (/hybrid/i.test(workArrangement)) workplaceType = "Hybrid";
    else if (/on.?site/i.test(workArrangement)) workplaceType = "On-site";

    // Posted date
    let postedDate = "";
    const allSpans = document.querySelectorAll("span");
    for (const span of allSpans) {
      const text = span.textContent?.trim() ?? "";
      if (/Posted\s+\d+[dwhmy]\s+ago/i.test(text)) {
        postedDate = text;
        break;
      }
    }

    // Already applied detection
    let isAlreadyApplied = false;
    const appliedBadge = document.querySelector('[data-automation="applied-badge"], [data-testid="applied-badge"]');
    if (appliedBadge) {
      isAlreadyApplied = true;
    } else {
      const spans = document.querySelectorAll("span, div, button");
      for (const el of spans) {
        const t = el.textContent?.trim().toLowerCase() ?? "";
        if (t === "applied" || t.includes("you applied") || t.includes("already applied")) {
          isAlreadyApplied = true;
          break;
        }
      }
    }

    // Job URL from panel
    let jobUrl = "";
    const titleLink = document.querySelector('[data-automation="job-detail-title"] a, h1 a') as HTMLAnchorElement | null;
    if (titleLink?.href) {
      jobUrl = titleLink.href.split("?")[0];
    }
    if (!jobUrl) {
      jobUrl = window.location.href.split("?")[0];
    }

    return {
      title,
      company,
      location,
      jobType,
      salary,
      description,
      companyLogoUrl,
      workplaceType,
      postedDate,
      isAlreadyApplied,
      jobUrl,
    };
  });

  return {
    title: details.title || basicInfo.title || "",
    company: details.company || basicInfo.company || "",
    location: details.location || basicInfo.location || "",
    url: details.jobUrl || basicInfo.url || "",
    source: "seek",
    description: details.description || undefined,
    salary: details.salary || undefined,
    postedDate: details.postedDate || undefined,
    jobType: details.jobType || undefined,
    workplaceType: details.workplaceType || undefined,
    companyLogoUrl: details.companyLogoUrl || undefined,
    isAlreadyApplied: details.isAlreadyApplied || undefined,
    scrapedAt: new Date().toISOString(),
  };
}

async function extractBasicInfoFromCard(
  card: ReturnType<Page["locator"]>,
): Promise<Partial<ScrapedJob>> {
  const title =
    (await card.locator('[data-testid="job-card-title"], a[data-automation="jobTitle"]').first().textContent()) ?? "";
  const company =
    (await card.locator('[data-automation="jobCompany"], span[class*="companyName"]').first().textContent()) ?? "";
  const location =
    (await card.locator('[data-testid="jobCardLocation"], [data-automation="jobCardLocation"]').first().textContent()) ?? "";
  const linkEl = card.locator('[data-testid="job-card-title"], a[data-automation="jobTitle"]').first();
  const href = (await linkEl.getAttribute("href")) ?? "";
  const url = href.startsWith("http") ? href.split("?")[0] : `https://www.seek.com.au${href}`.split("?")[0];

  return {
    title: title.trim(),
    company: company.trim(),
    location: location.trim(),
    url,
  };
}

// Simple card-only extraction (for fixture tests)
async function extractBasicJobsFromCards(page: Page): Promise<ScrapedJob[]> {
  await page
    .waitForSelector('[data-testid="job-card"], article[data-card-type="JobCard"]', { timeout: 15000 })
    .catch(() => null);

  const cards = await page
    .locator('[data-testid="job-card"], article[data-card-type="JobCard"]')
    .all();

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
          source: "seek",
          scrapedAt: new Date().toISOString(),
        });
      }
    } catch {
      // skip
    }
  }
  return jobs;
}

function buildSeekUrl(keyword: string, location: string, page: number): string {
  const params = new URLSearchParams({ keywords: keyword, where: location });
  if (page > 1) params.set("page", String(page));
  return `https://www.seek.com.au/jobs?${params.toString()}`;
}
