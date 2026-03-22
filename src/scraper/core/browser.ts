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
    args: [
      "--no-focus-on-navigate",
      "--no-startup-window",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
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
 * Styled to match JobJourney's Apple-style UI design system.
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

    // Header: logo + title + spinner
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px";

    // JJ Logo (inline SVG — simplified from jjlogo.svg)
    const logoContainer = document.createElement("div");
    logoContainer.style.cssText = "width:28px;height:28px;flex-shrink:0";
    const logoSvgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(logoSvgNS, "svg");
    svg.setAttribute("viewBox", "0 0 282.29 250.57");
    svg.setAttribute("width", "28");
    svg.setAttribute("height", "28");
    const path1 = document.createElementNS(logoSvgNS, "path");
    path1.setAttribute("fill", "#3160a3");
    path1.setAttribute("d", "M280.26,49.74c-2.27-3.43-6.99-6.48-16.56-6.48h-23.4v-8.59h-21.04l-.37,8.22h-.6l-25.11-.07S188.63,0,141.5,0h-.35c-46.8,.21-51.37,42.82-51.37,42.82h-.68l-25.1,.15v-8.3l-21.04-.15v8.3h-.97s-26.29,.15-26.29,.15c0,0-9.41-1.6-13.66,6.75,0,.01-.01,.02-.02,.03C.97,51.83,.24,54.54,.05,58.04H.05c-.03,.59-.05,1.19-.05,1.81v126.82s.07,.19,.21,.53c1.33,3.15,8.85,19.29,24.09,19.03,0,0,.2,.04,.56,.08,2.48,.29,12.4,.76,13.95-9.86,1.27-8.64,12.97-54.12,47.71-79.69,.37-.28,.76-.56,1.15-.83,12.78-9.11,28.6-15.53,48.07-16.53,1.77-.09,3.57-.14,5.4-.14s3.7,.05,5.51,.15c19.21,1.04,35.05,7.52,47.97,16.52,.38,.28,.77,.55,1.15,.83,35.82,25.74,48.67,70.8,48.67,70.8,0,0,1.64,17.32,12.99,18.75,.49,.07,1,.1,1.53,.1,12.74,0,23.11-6.81,23.11-13.12V59.26s.11-.49,.17-1.3c.14-1.79,.05-5.16-1.98-8.22Zm-139.12,39.31c-20.78,0-37.64-16.85-37.64-37.64S120.36,13.77,141.14,13.77s37.64,16.85,37.64,37.64-16.85,37.64-37.64,37.64Z");
    const path2 = document.createElementNS(logoSvgNS, "path");
    path2.setAttribute("fill", "#d3aa32");
    path2.setAttribute("d", "M136.03,132.37h9.33s12.89-4.22,12.89-12.44-8.89-8.67-8.89-8.67h-16.89s-8.44,.22-8.44,8.67,12,12.44,12,12.44Z");
    const path3 = document.createElementNS(logoSvgNS, "path");
    path3.setAttribute("fill", "#d3aa32");
    path3.setAttribute("d", "M148.04,137.04h-14s-8.84,80.22-8.84,80.22c0,0-2.4,7.56,0,11.78,2.4,4.22,12.53,19.56,12.53,19.56,0,0,3.69,4.44,7,0s9.95-19.56,9.95-19.56c0,0,1.47-2.89,0-11.11-1.47-8.22-6.63-80.89-6.63-80.89Z");
    svg.appendChild(path1);
    svg.appendChild(path2);
    svg.appendChild(path3);
    logoContainer.appendChild(svg);

    const titleGroup = document.createElement("div");
    titleGroup.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0";

    const title = document.createElement("span");
    title.style.cssText = "font-weight:600;font-size:14px;color:#000;line-height:1.2";
    title.textContent = "JobJourney";

    const subtitle = document.createElement("span");
    subtitle.style.cssText = "font-size:11px;color:#71717a;line-height:1.2";
    subtitle.textContent = "Scraping in progress";

    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const spinner = document.createElement("div");
    spinner.id = "__jj-spinner";
    spinner.style.cssText = "width:16px;height:16px;border:2px solid #e4e4e7;border-top-color:#3160a3;border-radius:50%;animation:__jj-spin 0.8s linear infinite;flex-shrink:0";

    header.appendChild(logoContainer);
    header.appendChild(titleGroup);
    header.appendChild(spinner);

    // Progress text
    const progressText = document.createElement("div");
    progressText.id = "__jj-progress-text";
    progressText.style.cssText = "font-size:12px;color:#52525b;margin-bottom:10px";
    progressText.textContent = "Starting...";

    // Progress bar
    const barContainer = document.createElement("div");
    barContainer.style.cssText = "background:#f4f4f5;border-radius:6px;height:5px;overflow:hidden;margin-bottom:12px";

    const bar = document.createElement("div");
    bar.id = "__jj-progress-bar";
    bar.style.cssText = "height:100%;background:#3160a3;border-radius:6px;width:0%;transition:width 0.3s ease";
    barContainer.appendChild(bar);

    // Footer: job count + stop button
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:space-between;align-items:center";

    const jobCount = document.createElement("span");
    jobCount.id = "__jj-job-count";
    jobCount.style.cssText = "font-size:11px;color:#a1a1aa";
    jobCount.textContent = "0 jobs collected";

    const stopBtn = document.createElement("button");
    stopBtn.id = "__jj-stop-btn";
    stopBtn.style.cssText = "background:#000;color:#fff;border:none;border-radius:10px;padding:5px 16px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s";
    stopBtn.textContent = "Stop";
    stopBtn.addEventListener("click", () => {
      stopBtn.textContent = "Stopping...";
      stopBtn.style.opacity = "0.5";
      stopBtn.style.cursor = "default";
      (window as any).__jj_stopScraping?.();
    });
    stopBtn.addEventListener("mouseenter", () => { stopBtn.style.background = "rgba(0,0,0,0.85)"; });
    stopBtn.addEventListener("mouseleave", () => { stopBtn.style.background = "#000"; });

    footer.appendChild(jobCount);
    footer.appendChild(stopBtn);

    overlay.appendChild(header);
    overlay.appendChild(progressText);
    overlay.appendChild(barContainer);
    overlay.appendChild(footer);

    const style = document.createElement("style");
    style.textContent = [
      "#__jj-scrape-overlay {",
      "  position: fixed; top: 16px; right: 16px; z-index: 2147483647;",
      "  background: #fff; color: #18181b;",
      "  border-radius: 16px; padding: 16px 20px;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
      "  box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06);",
      "  border: 1px solid rgba(0,0,0,0.06);",
      "  min-width: 260px; max-width: 300px; user-select: none;",
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

      const sourceName = p.source.charAt(0).toUpperCase() + p.source.slice(1);
      text.textContent = `${sourceName} — Page ${p.currentPage}/${p.totalPages}, job ${p.currentJob}/${p.totalCards}`;

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
