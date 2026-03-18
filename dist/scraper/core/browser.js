import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getJobJourneyPaths } from "../../config/paths.js";
const COOKIE_DIR = "cookies";
function getCookiePath(site) {
    const paths = getJobJourneyPaths();
    const cookieDir = path.join(paths.dataDir, COOKIE_DIR);
    mkdirSync(cookieDir, { recursive: true });
    return path.join(cookieDir, `${site}.json`);
}
function getChromeExecutable() {
    if (process.platform === "darwin" &&
        existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")) {
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    return undefined;
}
export async function launchBrowser() {
    return chromium.launch({
        headless: false,
        ...(getChromeExecutable() ? { executablePath: getChromeExecutable() } : {}),
    });
}
export async function createAuthenticatedContext(browser, site) {
    const cookiePath = getCookiePath(site);
    const context = await browser.newContext();
    if (existsSync(cookiePath)) {
        try {
            const cookies = JSON.parse(readFileSync(cookiePath, "utf-8"));
            await context.addCookies(cookies);
        }
        catch {
            // ignore corrupt cookie file
        }
    }
    return context;
}
export async function saveCookies(context, site) {
    const cookiePath = getCookiePath(site);
    const cookies = await context.cookies();
    writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
}
export async function loginToSite(site) {
    const urls = {
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
    const loggedInUrls = {
        seek: ["seek.com.au/my-activity", "seek.com.au/jobs", "seek.com.au/?"],
        linkedin: ["linkedin.com/feed", "linkedin.com/jobs", "linkedin.com/mynetwork"],
    };
    const targets = loggedInUrls[site.toLowerCase()] ?? [];
    try {
        await page.waitForURL((url) => targets.some((t) => url.toString().includes(t)), { timeout: 300_000 });
        // Save cookies after successful login
        await saveCookies(context, site.toLowerCase());
        await browser.close();
        return `Successfully logged in to ${site}. Cookies saved for future scraping sessions.`;
    }
    catch {
        await browser.close();
        return `Login timed out after 5 minutes. Please try again.`;
    }
}
export function hasCookies(site) {
    const cookiePath = getCookiePath(site);
    return existsSync(cookiePath);
}
