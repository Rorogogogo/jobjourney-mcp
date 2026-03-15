import { launchBrowser, createAuthenticatedContext, saveCookies } from "../core/browser.js";
const BASE_DELAY_MS = 300;
const PAGE_NAV_DELAY_MS = 1500;
const ERROR_DELAY_MS = 1500;
const MAX_TOTAL_JOBS = 500;
const PANEL_INITIAL_WAIT_MS = 200;
const PANEL_MAX_WAIT_MS = 3000;
const PANEL_MAX_ATTEMPTS = 25;
const PANEL_BACKOFF_MULTIPLIER = 1.5;
const POST_PANEL_RENDER_MS = 500;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export class SeekScraper {
    async scrape(request) {
        const browser = await launchBrowser();
        const context = await createAuthenticatedContext(browser, "seek");
        try {
            const page = await context.newPage();
            const maxPages = request.maxPages ?? 1;
            const allJobs = [];
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                const url = buildSeekUrl(request.keyword, request.location, pageNum);
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                if (pageNum > 1)
                    await sleep(PAGE_NAV_DELAY_MS);
                await scrollToBottom(page);
                const pageJobs = await scrapePageWithClickThrough(page);
                if (pageJobs.length === 0)
                    break;
                allJobs.push(...pageJobs);
                if (allJobs.length >= MAX_TOTAL_JOBS) {
                    allJobs.length = MAX_TOTAL_JOBS;
                    break;
                }
            }
            // Save cookies after scraping (may have refreshed session)
            await saveCookies(context, "seek");
            return allJobs;
        }
        finally {
            await browser.close();
        }
    }
}
// Exported for tests using HTML fixtures (no click-through, just card extraction)
export async function scrapeSeekPage(page, request) {
    if (!page.url().startsWith("file://")) {
        const url = buildSeekUrl(request.keyword, request.location, 1);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await scrollToBottom(page);
    }
    return extractBasicJobsFromCards(page);
}
async function scrollToBottom(page) {
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(500);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
}
async function scrapePageWithClickThrough(page) {
    await page
        .waitForSelector('[data-testid="job-card"], article[data-card-type="JobCard"]', { timeout: 15000 })
        .catch(() => null);
    const cards = await page
        .locator('[data-testid="job-card"], article[data-card-type="JobCard"]')
        .all();
    const jobs = [];
    for (const card of cards.slice(0, 30)) {
        try {
            // 1. Extract basic info from card
            const basicInfo = await extractBasicInfoFromCard(card);
            if (!basicInfo.title || !basicInfo.url)
                continue;
            // 2. Click the job card to open detail panel
            const clickTarget = card.locator('[data-testid="job-card-title"], a[data-automation="jobTitle"]').first();
            await clickTarget.click().catch(() => card.click());
            // 3. Wait for detail panel with exponential backoff
            const panelLoaded = await waitForDetailPanel(page);
            if (panelLoaded) {
                // 4. Extract full details from panel
                const details = await extractDetailPanel(page, basicInfo);
                jobs.push(details);
            }
            else {
                // Fallback to basic info
                jobs.push({
                    title: basicInfo.title || "",
                    company: basicInfo.company || "",
                    location: basicInfo.location || "",
                    url: basicInfo.url || "",
                    source: "seek",
                    scrapedAt: new Date().toISOString(),
                });
            }
            await sleep(BASE_DELAY_MS);
        }
        catch {
            await sleep(ERROR_DELAY_MS);
        }
    }
    return jobs;
}
async function waitForDetailPanel(page) {
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
async function extractDetailPanel(page, basicInfo) {
    const details = await page.evaluate(() => {
        const getText = (selectors) => {
            for (const sel of selectors.split(",")) {
                const el = document.querySelector(sel.trim());
                if (el?.textContent?.trim())
                    return el.textContent.trim();
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
        const description = descEl ? descEl.innerText.replace(/\n{3,}/g, "\n\n").trim() : "";
        // Company logo
        const logoEl = document.querySelector('[data-testid="bx-logo-image"] img, [data-automation="advertiser-logo"] img');
        const companyLogoUrl = logoEl?.src ?? "";
        // Workplace type from card or panel
        const workArrangement = getText('[data-testid="work-arrangement"]');
        let workplaceType = "";
        if (/remote/i.test(workArrangement))
            workplaceType = "Remote";
        else if (/hybrid/i.test(workArrangement))
            workplaceType = "Hybrid";
        else if (/on.?site/i.test(workArrangement))
            workplaceType = "On-site";
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
        }
        else {
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
        const titleLink = document.querySelector('[data-automation="job-detail-title"] a, h1 a');
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
async function extractBasicInfoFromCard(card) {
    const title = (await card.locator('[data-testid="job-card-title"], a[data-automation="jobTitle"]').first().textContent()) ?? "";
    const company = (await card.locator('[data-automation="jobCompany"], span[class*="companyName"]').first().textContent()) ?? "";
    const location = (await card.locator('[data-testid="jobCardLocation"], [data-automation="jobCardLocation"]').first().textContent()) ?? "";
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
async function extractBasicJobsFromCards(page) {
    await page
        .waitForSelector('[data-testid="job-card"], article[data-card-type="JobCard"]', { timeout: 15000 })
        .catch(() => null);
    const cards = await page
        .locator('[data-testid="job-card"], article[data-card-type="JobCard"]')
        .all();
    const jobs = [];
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
        }
        catch {
            // skip
        }
    }
    return jobs;
}
function buildSeekUrl(keyword, location, page) {
    const params = new URLSearchParams({ keywords: keyword, where: location });
    if (page > 1)
        params.set("page", String(page));
    return `https://www.seek.com.au/jobs?${params.toString()}`;
}
