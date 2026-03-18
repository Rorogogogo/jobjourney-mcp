import { type Browser, type BrowserContext } from "playwright";
export declare function launchBrowser(): Promise<Browser>;
export declare function createAuthenticatedContext(browser: Browser, site: string): Promise<BrowserContext>;
export declare function saveCookies(context: BrowserContext, site: string): Promise<void>;
export declare function loginToSite(site: string): Promise<string>;
export declare function hasCookies(site: string): boolean;
