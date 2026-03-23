import { type Browser, type BrowserContext, type Page } from "playwright";
import { createAuthenticatedContext } from "../scraper/core/browser.js";

export type AggregatorSite = "linkedin" | "seek" | "indeed" | "none";

export function detectAggregator(url: string): AggregatorSite {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("linkedin.com")) return "linkedin";
    if (hostname.includes("seek.com.au") || hostname.includes("seek.co.nz")) return "seek";
    if (hostname.includes("indeed.com")) return "indeed";
    return "none";
  } catch {
    return "none";
  }
}

/**
 * Given any job URL (aggregator or direct ATS), returns the real application URL.
 * For LinkedIn/Seek/Indeed pages, uses Playwright to click the Apply button and
 * capture where it redirects — either a new tab or same-page navigation.
 */
export async function resolveApplyUrl(
  url: string,
  browser: Browser,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const site = detectAggregator(url);
  if (site === "none") return url;

  onProgress?.(`Detected ${site} page, navigating to find Apply button...`);

  const context = await createAuthenticatedContext(browser, site);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const resolved = await clickApplyAndCaptureUrl(page, site, context, onProgress, url);
    return resolved ?? url;
  } finally {
    await context.close();
  }
}

async function clickApplyAndCaptureUrl(
  page: Page,
  site: AggregatorSite,
  context: BrowserContext,
  onProgress?: (msg: string) => void,
  originalUrl?: string,
): Promise<string | null> {
  const selectors: Record<AggregatorSite, string[]> = {
    linkedin: [
      ".jobs-apply-button--top-card",
      ".jobs-apply-button",
      "button.artdeco-button--primary[data-job-id]",
      "a[data-control-name='jobdetails_topcard_inapply']",
    ],
    seek: [
      "a[data-automation='job-detail-apply']",
      "a[data-testid='job-detail-apply']",
      "button[data-automation='job-detail-apply']",
      "a[data-automation='apply-button']",
    ],
    indeed: [
      "#indeedApplyButton",
      "a[data-indeed-apply-joburl]",
      ".jobsearch-IndeedApplyButton a",
      "#applyButtonLinkContainer a",
    ],
    none: [],
  };

  // Find the first visible Apply button
  let foundSelector: string | null = null;
  for (const selector of selectors[site]) {
    try {
      const visible = await page.locator(selector).first().isVisible({ timeout: 3_000 });
      if (visible) {
        foundSelector = selector;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!foundSelector) {
    onProgress?.("Could not find Apply button, using original URL");
    return null;
  }

  onProgress?.("Found Apply button, clicking...");

  // Arm new-tab listener before clicking
  const newTabPromise = context.waitForEvent("page", { timeout: 10_000 }).catch(() => null);

  await page.locator(foundSelector).first().click({ timeout: 10_000 }).catch(() => {});

  // Give a short window for either a new tab or same-page navigation
  const newTab = await newTabPromise;

  if (newTab) {
    await (newTab as Page).waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    const resolved = (newTab as Page).url();
    onProgress?.(`Resolved to: ${resolved}`);
    await (newTab as Page).close().catch(() => {});
    return resolved;
  }

  // Same-page navigation fallback — check if URL changed from original
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
  const resolved = page.url();
  if (resolved !== originalUrl) {
    onProgress?.(`Resolved to: ${resolved}`);
    return resolved;
  }

  return null;
}
