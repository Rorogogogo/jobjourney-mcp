import { type Browser, type BrowserContext, type Page } from "playwright";
import {
  launchBrowser,
  createAuthenticatedContext,
  isBrowserClosedError,
} from "../scraper/core/browser.js";
import { detectAggregator } from "./resolve-apply-url.js";

let activeBrowser: Browser | null = null;
let activeContext: BrowserContext | null = null;
let activePage: Page | null = null;
let activeAggregatorType: string = "none";

/**
 * Returns the active Browser instance, or null if no session exists.
 */
export function getActiveBrowser(): Browser | null {
  return activeBrowser;
}

/**
 * Returns the active Playwright Page, or null if no session exists.
 */
export function getActivePage(): Page | null {
  if (activePage && !activePage.isClosed()) return activePage;
  activePage = null;
  return null;
}

/**
 * Returns the active page or throws if none exists.
 */
export function requireActivePage(): Page {
  const page = getActivePage();
  if (!page) {
    throw new Error("No page open. Call open_application_page first.");
  }
  return page;
}

/**
 * Opens a URL in the persistent browser session.
 * Creates the browser if it doesn't exist.
 * If an aggregator site, uses authenticated context with saved cookies.
 */
export async function openPage(url: string): Promise<{ page: Page; resolvedUrl: string }> {
  // If browser exists but is disconnected, clean up
  if (activeBrowser && !activeBrowser.isConnected()) {
    await closeBrowserSession();
  }

  if (!activeBrowser) {
    activeBrowser = await launchBrowser();
  }

  const aggregator = detectAggregator(url);

  // Reuse existing page if context type matches, otherwise create new context
  if (activePage && !activePage.isClosed() && activeAggregatorType === aggregator) {
    await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } else {
    // Different context type needed — close old, create new
    if (activeContext) {
      await activeContext.close().catch(() => {});
      activeContext = null;
      activePage = null;
    }

    activeContext =
      aggregator !== "none"
        ? await createAuthenticatedContext(activeBrowser, aggregator)
        : await activeBrowser.newContext();

    activeAggregatorType = aggregator;
    activePage = await activeContext.newPage();
    await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  // Wait for DOM to settle
  await activePage
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});

  return { page: activePage, resolvedUrl: activePage.url() };
}

/**
 * Closes the browser session and resets all state.
 */
export async function closeBrowserSession(): Promise<void> {
  try {
    if (activeContext) await activeContext.close().catch(() => {});
    if (activeBrowser) await activeBrowser.close().catch(() => {});
  } finally {
    activeBrowser = null;
    activeContext = null;
    activePage = null;
    activeAggregatorType = "none";
  }
}

/**
 * Checks if an error indicates the browser was closed externally.
 */
export function isBrowserDead(err: unknown): boolean {
  return isBrowserClosedError(err);
}

// Cleanup on process exit to prevent orphaned Chrome processes
function cleanup() {
  if (activeBrowser) {
    activeBrowser.close().catch(() => {});
    activeBrowser = null;
    activeContext = null;
    activePage = null;
    activeAggregatorType = "none";
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
