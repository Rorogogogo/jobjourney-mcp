import { launchBrowser, createStopController, injectScrapingOverlay, updateOverlayProgress, isBrowserClosedError, } from "../core/browser.js";
const PAGE_NAV_DELAY_MS = 2000;
const CLOUDFLARE_WAIT_MS = 8000;
const MAX_TOTAL_JOBS = 500;
const TOTAL_SCRAPE_TIMEOUT_MS = 15 * 60 * 1000;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/**
 * Indeed scraper — card-only extraction (no click-through).
 *
 * Indeed cards navigate away from the search page on click (no split-serp),
 * and redirect links are behind Cloudflare verification, so we extract
 * all available data directly from the search results cards.
 */
export class IndeedScraper {
    async scrape(request) {
        const browser = await launchBrowser();
        const controller = createStopController(browser);
        const scrapeStart = Date.now();
        try {
            const context = await browser.newContext();
            const page = await context.newPage();
            const maxPages = request.maxPages ?? 1;
            const allJobs = [];
            for (let pageNum = 0; pageNum < maxPages; pageNum++) {
                if (controller.stopped)
                    break;
                if (Date.now() - scrapeStart > TOTAL_SCRAPE_TIMEOUT_MS)
                    break;
                const url = buildIndeedUrl(request.keyword, request.location, pageNum);
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
                if (pageNum === 0) {
                    await waitForCloudflare(page);
                }
                else {
                    await sleep(PAGE_NAV_DELAY_MS);
                }
                await injectScrapingOverlay(page, controller);
                await updateOverlayProgress(page, {
                    source: "Indeed",
                    currentJob: 0,
                    totalCards: 0,
                    currentPage: pageNum + 1,
                    totalPages: maxPages,
                    jobsCollected: allJobs.length,
                });
                const pageJobs = await extractJobsFromPage(page);
                if (pageJobs.length === 0)
                    break;
                allJobs.push(...pageJobs);
                await updateOverlayProgress(page, {
                    source: "Indeed",
                    currentJob: pageJobs.length,
                    totalCards: pageJobs.length,
                    currentPage: pageNum + 1,
                    totalPages: maxPages,
                    jobsCollected: allJobs.length,
                });
                if (allJobs.length >= MAX_TOTAL_JOBS) {
                    allJobs.length = MAX_TOTAL_JOBS;
                    break;
                }
            }
            return allJobs;
        }
        catch (err) {
            if (isBrowserClosedError(err))
                return [];
            throw err;
        }
        finally {
            if (!controller.stopped) {
                await browser.close().catch(() => { });
            }
        }
    }
}
async function waitForCloudflare(page) {
    const title = await page.title();
    if (title.includes("Just a moment") || title.includes("Verification")) {
        await page.waitForFunction(() => !document.title.includes("Just a moment") && !document.title.includes("Verification"), { timeout: 30000 }).catch(() => null);
        await sleep(CLOUDFLARE_WAIT_MS);
    }
    else {
        await sleep(2000);
    }
}
async function extractJobsFromPage(page) {
    await page
        .waitForSelector(".job_seen_beacon", { timeout: 15000 })
        .catch(() => null);
    // Extract all jobs in a single page.evaluate to avoid per-card overhead.
    // Use .job_seen_beacon as the card selector — these are the outer wrappers
    // that contain both the link and the metadata. The [data-jk] elements are
    // inner duplicates without links.
    return page.evaluate(() => {
        const cards = document.querySelectorAll(".job_seen_beacon");
        const jobs = [];
        const seen = new Set();
        for (const el of cards) {
            const getText = (selector) => el.querySelector(selector)?.textContent?.trim() ?? "";
            // Title — prefer span[title] attribute for clean text
            const titleEl = el.querySelector("a.jcs-JobTitle span[title], h2.jobTitle a span");
            const title = titleEl?.getAttribute("title") ??
                titleEl?.textContent?.trim() ??
                getText(".jobTitle");
            if (!title)
                continue;
            // Company
            const company = getText('[data-testid="company-name"], .companyName');
            // Location
            const location = getText('[data-testid="text-location"], .companyLocation');
            // URL — build canonical viewjob URL from data-jk if available
            const jk = el.getAttribute("data-jk") ||
                el.querySelector("[data-jk]")?.getAttribute("data-jk") ||
                "";
            let url = "";
            if (jk) {
                url = `https://au.indeed.com/viewjob?jk=${jk}`;
            }
            else {
                const titleLink = el.querySelector("a.jcs-JobTitle, h2.jobTitle a");
                const href = titleLink?.getAttribute("href") ?? "";
                url = href.startsWith("http")
                    ? href
                    : href
                        ? `https://au.indeed.com${href}`
                        : "";
            }
            if (!url)
                continue;
            // Deduplicate by jk or URL
            const dedupeKey = jk || url;
            if (seen.has(dedupeKey))
                continue;
            seen.add(dedupeKey);
            // Salary and job type from metadata snippets
            let salary;
            const jobTypeParts = [];
            el.querySelectorAll(".metadata .attribute_snippet, .metadata div, [data-testid=\"attribute_snippet_testid\"], .salary-snippet-container").forEach((m) => {
                const text = m.textContent?.trim() ?? "";
                if (!text)
                    return;
                // Salary text contains $ or pay-period keywords
                if (/\$|a\s+year|a\s+month|per\s+annum|an\s+hour/i.test(text)) {
                    if (!salary)
                        salary = text;
                }
                else if (/full.?time|part.?time|contract|casual|temporary|permanent/i.test(text)) {
                    jobTypeParts.push(text);
                }
            });
            const jobType = jobTypeParts.join(", ") || undefined;
            // Posted date
            const postedDate = getText('.date, [data-testid="myJobsStateDate"]') || undefined;
            jobs.push({
                title,
                company,
                location,
                url,
                source: "indeed",
                salary,
                postedDate,
                jobType,
                scrapedAt: new Date().toISOString(),
            });
        }
        return jobs;
    });
}
function buildIndeedUrl(keyword, location, pageNum) {
    const params = new URLSearchParams({ q: keyword, l: location });
    if (pageNum > 0)
        params.set("start", String(pageNum * 10));
    return `https://au.indeed.com/jobs?${params.toString()}`;
}
