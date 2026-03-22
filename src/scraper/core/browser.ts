import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { getJobJourneyPaths } from "../../config/paths.js";

const COOKIE_DIR = "cookies";

function getCookiePath(site: string): string {
  const paths = getJobJourneyPaths();
  const cookieDir = path.join(paths.dataDir, COOKIE_DIR);
  mkdirSync(cookieDir, { recursive: true });
  return path.join(cookieDir, `${site}.json`);
}

function getChromeExecutable(): string | undefined {
  if (
    process.platform === "darwin" &&
    existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
  ) {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return undefined;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    ...(getChromeExecutable() ? { executablePath: getChromeExecutable() } : {}),
  });
}

export async function createAuthenticatedContext(
  browser: Browser,
  site: string,
): Promise<BrowserContext> {
  const cookiePath = getCookiePath(site);
  const context = await browser.newContext();

  if (existsSync(cookiePath)) {
    try {
      const cookies = JSON.parse(readFileSync(cookiePath, "utf-8"));
      await context.addCookies(cookies);
    } catch {
      // ignore corrupt cookie file
    }
  }

  return context;
}

export async function saveCookies(
  context: BrowserContext,
  site: string,
): Promise<void> {
  const cookiePath = getCookiePath(site);
  const cookies = await context.cookies();
  writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
}

export async function loginToSite(site: string): Promise<string> {
  const urls: Record<string, string> = {
    seek: "https://www.seek.com.au/oauth/login",
    linkedin: "https://www.linkedin.com/login",
  };

  const loginUrl = urls[site.toLowerCase()];
  if (!loginUrl) {
    return `Unknown site: ${site}. Available: ${Object.keys(urls).join(", ")}`;
  }

  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for the user to complete login — detect navigation away from login page
  // We wait up to 5 minutes for the user to log in
  const loggedInUrls: Record<string, string[]> = {
    seek: ["seek.com.au/my-activity", "seek.com.au/jobs", "seek.com.au/?"],
    linkedin: ["linkedin.com/feed", "linkedin.com/jobs", "linkedin.com/mynetwork"],
  };

  const targets = loggedInUrls[site.toLowerCase()] ?? [];

  try {
    await page.waitForURL(
      (url) => targets.some((t) => url.toString().includes(t)),
      { timeout: 300_000 },
    );

    // Save cookies after successful login
    await saveCookies(context, site.toLowerCase());

    await browser.close();
    return `Successfully logged in to ${site}. Cookies saved for future scraping sessions.`;
  } catch {
    await browser.close();
    return `Login timed out after 5 minutes. Please try again.`;
  }
}

export function hasCookies(site: string): boolean {
  const cookiePath = getCookiePath(site);
  return existsSync(cookiePath);
}

// ---------------------------------------------------------------------------
// Scraping overlay & stop controller
// ---------------------------------------------------------------------------

export interface ScrapeProgress {
  source: string;
  currentJob: number;
  totalCards: number;
  currentPage: number;
  totalPages: number;
  jobsCollected: number;
}

export interface StopController {
  /** True when the user clicked Stop or the browser was closed. */
  get stopped(): boolean;
  /** Call to manually trigger a stop. */
  stop(): void;
}

/**
 * Creates a stop controller that also listens for browser disconnect.
 * Scrapers should check `controller.stopped` before processing each card.
 */
export function createStopController(browser: Browser): StopController {
  let _stopped = false;

  browser.on("disconnected", () => {
    _stopped = true;
  });

  return {
    get stopped() {
      return _stopped;
    },
    stop() {
      _stopped = true;
    },
  };
}

/**
 * Inject a floating overlay into the page showing scraping progress.
 * Exposes `window.__jj_stopScraping()` which resolves back to Node via
 * page.exposeFunction so the scraping loop can be halted.
 */
export async function injectScrapingOverlay(
  page: Page,
  controller: StopController,
): Promise<void> {
  // Expose stop function (only once per context — ignore if already exposed)
  try {
    await page.exposeFunction("__jj_stopScraping", () => {
      controller.stop();
    });
  } catch {
    // Already exposed in this context
  }

  await page.evaluate(() => {
    if (document.getElementById("__jj-scrape-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "__jj-scrape-overlay";

    // Build overlay DOM safely without innerHTML
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";

    const spinner = document.createElement("div");
    spinner.id = "__jj-spinner";
    spinner.style.cssText = "width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:__jj-spin 0.8s linear infinite";

    const title = document.createElement("span");
    title.style.cssText = "font-weight:600;font-size:14px";
    title.textContent = "JobJourney Scraping";

    header.appendChild(spinner);
    header.appendChild(title);

    const progressText = document.createElement("div");
    progressText.id = "__jj-progress-text";
    progressText.style.cssText = "font-size:12px;opacity:0.9;margin-bottom:8px";
    progressText.textContent = "Starting...";

    const barContainer = document.createElement("div");
    barContainer.style.cssText = "background:rgba(255,255,255,0.2);border-radius:4px;height:4px;overflow:hidden;margin-bottom:10px";

    const bar = document.createElement("div");
    bar.id = "__jj-progress-bar";
    bar.style.cssText = "height:100%;background:#fff;border-radius:4px;width:0%;transition:width 0.3s";
    barContainer.appendChild(bar);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:space-between;align-items:center";

    const jobCount = document.createElement("span");
    jobCount.id = "__jj-job-count";
    jobCount.style.cssText = "font-size:11px;opacity:0.7";
    jobCount.textContent = "0 jobs collected";

    const stopBtn = document.createElement("button");
    stopBtn.id = "__jj-stop-btn";
    stopBtn.style.cssText = "background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:6px;padding:4px 14px;font-size:12px;cursor:pointer;transition:background 0.2s";
    stopBtn.textContent = "Stop";
    stopBtn.addEventListener("click", () => {
      stopBtn.textContent = "Stopping...";
      stopBtn.style.opacity = "0.5";
      (window as any).__jj_stopScraping?.();
    });
    stopBtn.addEventListener("mouseenter", () => { stopBtn.style.background = "rgba(255,255,255,0.35)"; });
    stopBtn.addEventListener("mouseleave", () => { stopBtn.style.background = "rgba(255,255,255,0.2)"; });

    footer.appendChild(jobCount);
    footer.appendChild(stopBtn);

    overlay.appendChild(header);
    overlay.appendChild(progressText);
    overlay.appendChild(barContainer);
    overlay.appendChild(footer);

    const style = document.createElement("style");
    style.textContent = [
      "#__jj-scrape-overlay {",
      "  position: fixed; top: 12px; right: 12px; z-index: 2147483647;",
      "  background: linear-gradient(135deg, #6366f1, #8b5cf6);",
      "  color: #fff; border-radius: 12px; padding: 14px 18px;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
      "  box-shadow: 0 4px 24px rgba(0,0,0,0.3);",
      "  min-width: 240px; user-select: none;",
      "}",
      "@keyframes __jj-spin { to { transform: rotate(360deg); } }",
    ].join("\n");

    document.head.appendChild(style);
    document.body.appendChild(overlay);
  });
}

/**
 * Update the overlay progress text and bar.
 * Silently no-ops if the page is closed or overlay was removed.
 */
export async function updateOverlayProgress(
  page: Page,
  progress: ScrapeProgress,
): Promise<void> {
  try {
    await page.evaluate((p: ScrapeProgress) => {
      const text = document.getElementById("__jj-progress-text");
      const bar = document.getElementById("__jj-progress-bar");
      const count = document.getElementById("__jj-job-count");
      if (!text) return;

      text.textContent = `${p.source} — Job ${p.currentJob}/${p.totalCards} on page ${p.currentPage}/${p.totalPages}`;

      const totalWork = p.totalPages * p.totalCards;
      const doneWork = (p.currentPage - 1) * p.totalCards + p.currentJob;
      const pct = totalWork > 0 ? Math.min(100, Math.round((doneWork / totalWork) * 100)) : 0;
      if (bar) bar.style.width = pct + "%";
      if (count) count.textContent = p.jobsCollected + " jobs collected";
    }, progress);
  } catch {
    // Page closed or navigated — ignore
  }
}

/**
 * Returns true if the error indicates the browser/page was closed by the user.
 */
export function isBrowserClosedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("target closed") ||
    msg.includes("browser has been closed") ||
    msg.includes("browser.close") ||
    msg.includes("context has been closed") ||
    msg.includes("page has been closed") ||
    msg.includes("connection closed")
  );
}
