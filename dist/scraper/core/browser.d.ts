import { type Browser, type BrowserContext, type Page } from "playwright";
export declare function launchBrowser(): Promise<Browser>;
export declare function createAuthenticatedContext(browser: Browser, site: string): Promise<BrowserContext>;
export declare function saveCookies(context: BrowserContext, site: string): Promise<void>;
export declare function loginToSite(site: string): Promise<string>;
export declare function hasCookies(site: string): boolean;
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
export declare function createStopController(browser: Browser): StopController;
/**
 * Inject a floating overlay into the page showing scraping progress.
 * Styled to match JobJourney's Apple-style UI design system.
 * Exposes `window.__jj_stopScraping()` which resolves back to Node via
 * page.exposeFunction so the scraping loop can be halted.
 */
export declare function injectScrapingOverlay(page: Page, controller: StopController): Promise<void>;
/**
 * Update the overlay progress text and bar.
 * Silently no-ops if the page is closed or overlay was removed.
 */
export declare function updateOverlayProgress(page: Page, progress: ScrapeProgress): Promise<void>;
/**
 * Returns true if the error indicates the browser/page was closed by the user.
 */
export declare function isBrowserClosedError(err: unknown): boolean;
