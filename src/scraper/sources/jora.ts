import type { Page } from "playwright";
import {
  launchBrowser,
  createStopController,
  injectScrapingOverlay,
  updateOverlayProgress,
  isBrowserClosedError,
  type StopController,
} from "../core/browser.js";
import type {
  ScrapeRequest,
  ScrapedJob,
  JobSourceScraper,
} from "../core/types.js";

const BASE_DELAY_MS = 400;
const PAGE_NAV_DELAY_MS = 2000;
const CLOUDFLARE_WAIT_MS = 8000;
const MAX_TOTAL_JOBS = 500;
const TOTAL_SCRAPE_TIMEOUT_MS = 15 * 60 * 1000;
const CARD_TIMEOUT_MS = 15_000;
const DETAIL_PANEL_WAIT_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class JoraScraper implements JobSourceScraper {
  async scrape(request: ScrapeRequest): Promise<ScrapedJob[]> {
    const browser = await launchBrowser();
    const controller = createStopController(browser);
    const scrapeStart = Date.now();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const maxPages = request.maxPages ?? 1;
      const allJobs: ScrapedJob[] = [];

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        if (controller.stopped) break;
        if (Date.now() - scrapeStart > TOTAL_SCRAPE_TIMEOUT_MS) break;

        const url = buildJoraUrl(request.keyword, request.location, pageNum);
        await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });

        // First page needs extra wait for Cloudflare challenge
        if (pageNum === 1) {
          await waitForCloudflare(page);
        } else {
          await sleep(PAGE_NAV_DELAY_MS);
        }

        await injectScrapingOverlay(page, controller);

        const pageJobs = await scrapePageCards(page, scrapeStart, controller, pageNum, maxPages, allJobs.length);
        if (pageJobs.length === 0) break;

        allJobs.push(...pageJobs);
        if (allJobs.length >= MAX_TOTAL_JOBS) {
          allJobs.length = MAX_TOTAL_JOBS;
          break;
        }
      }

      return allJobs;
    } catch (err) {
      if (isBrowserClosedError(err)) return [];
      throw err;
    } finally {
      if (!controller.stopped) {
        await browser.close().catch(() => {});
      }
    }
  }
}

async function waitForCloudflare(page: Page): Promise<void> {
  const title = await page.title();
  if (title.includes("Just a moment")) {
    // Cloudflare challenge is active — wait for it to resolve
    await page.waitForFunction(
      () => !document.title.includes("Just a moment"),
      { timeout: 30000 },
    ).catch(() => null);
    await sleep(CLOUDFLARE_WAIT_MS);
  } else {
    await sleep(2000);
  }
}

async function scrapePageCards(
  page: Page,
  scrapeStart: number,
  controller: StopController,
  currentPage: number,
  totalPages: number,
  previousJobCount: number,
): Promise<ScrapedJob[]> {
  await page
    .waitForSelector(".job-card.result.organic-job", { timeout: 15000 })
    .catch(() => null);

  const cards = await page.locator(".job-card.result.organic-job").all();
  const jobs: ScrapedJob[] = [];
  const totalCards = Math.min(cards.length, 30);

  for (let i = 0; i < totalCards; i++) {
    if (controller.stopped) break;
    if (Date.now() - scrapeStart > TOTAL_SCRAPE_TIMEOUT_MS) break;

    await updateOverlayProgress(page, {
      source: "Jora",
      currentJob: i + 1,
      totalCards,
      currentPage,
      totalPages,
      jobsCollected: previousJobCount + jobs.length,
    });

    try {
      const job = await withTimeout(processCard(page, cards[i]), CARD_TIMEOUT_MS);
      if (job) {
        jobs.push(job);
      }
      await sleep(BASE_DELAY_MS);
    } catch (err) {
      if (isBrowserClosedError(err)) break;
      // skip failed card
    }
  }

  return jobs;
}

async function processCard(
  page: Page,
  card: ReturnType<Page["locator"]>,
): Promise<ScrapedJob | null> {
  const basicInfo = await extractBasicInfoFromCard(card);
  if (!basicInfo.title || !basicInfo.url) return null;

  // Click card to open split-serp detail panel
  const clickTarget = card.locator("a.job-link.-desktop-only").first();
  await clickTarget.click().catch(() => card.click());
  await sleep(DETAIL_PANEL_WAIT_MS);

  // Try to extract detail from side panel
  const details = await extractDetailPanel(page);

  // Resolve the apply redirect using the browser context (Cloudflare blocks plain fetch)
  let externalUrl: string | undefined;
  if (details?.applyUrl) {
    externalUrl = await resolveApplyRedirect(page, details.applyUrl);
  }

  return {
    title: basicInfo.title,
    company: basicInfo.company || "",
    location: basicInfo.location || "",
    url: basicInfo.url,
    externalUrl,
    source: "jora",
    description: details?.description || basicInfo.abstract || undefined,
    salary: details?.salary || basicInfo.salary || undefined,
    postedDate: basicInfo.postedDate || undefined,
    jobType: basicInfo.jobType || undefined,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Follow Jora's /job/rd/ redirect using the browser context to bypass Cloudflare.
 * Opens the redirect URL in a new tab, captures the final URL, then closes the tab.
 */
async function resolveApplyRedirect(page: Page, applyPath: string): Promise<string | undefined> {
  try {
    const url = applyPath.startsWith("http")
      ? applyPath
      : `https://au.jora.com${applyPath}`;

    const context = page.context();
    const newPage = await context.newPage();
    try {
      // Navigate but don't wait for full load — we just need the redirect
      await newPage.goto(url, { waitUntil: "commit", timeout: 10000 });
      const finalUrl = newPage.url();
      // Only return if we actually redirected away from Jora
      if (finalUrl && !finalUrl.includes("jora.com")) {
        return finalUrl.split("?")[0]; // Strip tracking params
      }
      return undefined;
    } finally {
      await newPage.close();
    }
  } catch {
    return undefined;
  }
}

async function extractBasicInfoFromCard(
  card: ReturnType<Page["locator"]>,
): Promise<{
  title: string;
  company: string;
  location: string;
  url: string;
  abstract: string;
  postedDate: string;
  salary: string;
  jobType: string;
}> {
  return card.evaluate((el) => {
    const getText = (selector: string): string =>
      el.querySelector(selector)?.textContent?.trim() ?? "";

    // Title: get from the desktop link to avoid duplication
    const titleLink = el.querySelector("a.job-link.-desktop-only") as HTMLAnchorElement | null;
    const title = titleLink?.textContent?.trim() ?? getText(".job-title");

    const company = getText(".job-company");
    const location = getText(".job-location");
    const abstract = getText(".job-abstract");
    const postedDate = getText(".job-listed-date");

    // URL from the job link
    const href = titleLink?.getAttribute("href") ?? "";
    const url = href.startsWith("http") ? href : href ? `https://au.jora.com${href}` : "";

    // Salary (sometimes in a badge or dedicated element)
    const salary = getText(".job-salary");

    // Job type and salary from badges (skip "New to you")
    const jobTypeParts: string[] = [];
    let badgeSalary = salary;
    el.querySelectorAll(".badge").forEach((b) => {
      const text = b.textContent?.trim() ?? "";
      if (!text || text.includes("New to you")) return;
      // Salary badges contain $ or "a year"/"a month"
      if (/\$|a\s+year|a\s+month|per\s+annum/i.test(text)) {
        if (!badgeSalary) badgeSalary = text;
      } else {
        jobTypeParts.push(text);
      }
    });
    const jobType = jobTypeParts.join(", ");

    return { title, company, location, url, abstract, postedDate, salary: badgeSalary, jobType };
  });
}

async function extractDetailPanel(
  page: Page,
): Promise<{ description: string; salary: string; applyUrl: string } | null> {
  return page.evaluate(() => {
    const container = document.querySelector(".job-description-container");
    if (!container) return null;

    const description = (container as HTMLElement).innerText
      ?.replace(/\n{3,}/g, "\n\n")
      .trim() ?? "";

    // Salary sometimes appears in the detail panel header
    const salaryEl = document.querySelector(".job-view-salary, .salary");
    const salary = salaryEl?.textContent?.trim() ?? "";

    // Apply URL
    const applyLink = document.querySelector("a.apply-button") as HTMLAnchorElement | null;
    const applyUrl = applyLink?.getAttribute("href") ?? "";

    return { description, salary, applyUrl };
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function buildJoraUrl(keyword: string, location: string, pageNum: number): string {
  const params = new URLSearchParams({ q: keyword, l: location });
  if (pageNum > 1) params.set("p", String(pageNum));
  return `https://au.jora.com/j?${params.toString()}`;
}
