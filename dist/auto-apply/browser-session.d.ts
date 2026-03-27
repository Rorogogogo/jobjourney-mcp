import { type Browser, type Page } from "playwright";
/**
 * Returns the active Browser instance, or null if no session exists.
 */
export declare function getActiveBrowser(): Browser | null;
/**
 * Returns the active Playwright Page, or null if no session exists.
 */
export declare function getActivePage(): Page | null;
/**
 * Returns the active page or throws if none exists.
 */
export declare function requireActivePage(): Page;
/**
 * Opens a URL in the persistent browser session.
 * Creates the browser if it doesn't exist.
 * If an aggregator site, uses authenticated context with saved cookies.
 */
export declare function openPage(url: string): Promise<{
    page: Page;
    resolvedUrl: string;
}>;
/**
 * Closes the browser session and resets all state.
 */
export declare function closeBrowserSession(): Promise<void>;
/**
 * Checks if an error indicates the browser was closed externally.
 */
export declare function isBrowserDead(err: unknown): boolean;
