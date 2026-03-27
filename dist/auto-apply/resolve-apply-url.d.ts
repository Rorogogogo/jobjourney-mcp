import { type Browser } from "playwright";
export type AggregatorSite = "linkedin" | "seek" | "indeed" | "none";
export declare function detectAggregator(url: string): AggregatorSite;
/**
 * Given any job URL (aggregator or direct ATS), returns the real application URL.
 * For LinkedIn/Seek/Indeed pages, uses Playwright to click the Apply button and
 * capture where it redirects — either a new tab or same-page navigation.
 */
export declare function resolveApplyUrl(url: string, browser: Browser, onProgress?: (msg: string) => void): Promise<string>;
