import { FastMCP } from "fastmcp";
import { runScrape, getAvailableSources } from "../scraper/core/run-scrape.js";
import { openDatabase } from "../storage/sqlite/db.js";
import { ensureAgentRunning } from "../agent/process.js";
import { loginToSite, hasCookies } from "../scraper/core/browser.js";
import type { SessionAuth } from "../types.js";
import { runDiscovery } from "../discovery/core/run-discovery.js";
import { getActiveDiscoverySourceNames } from "../discovery/sources/registry.js";
interface LocalScrapingToolDeps {
    runScrape?: typeof runScrape;
    getAvailableSources?: typeof getAvailableSources;
    runDiscovery?: typeof runDiscovery;
    getActiveDiscoverySourceNames?: typeof getActiveDiscoverySourceNames;
    openDatabase?: typeof openDatabase;
    ensureAgentRunning?: typeof ensureAgentRunning;
    loginToSite?: typeof loginToSite;
    hasCookies?: typeof hasCookies;
}
export declare function registerLocalScrapingTools(server: FastMCP<SessionAuth>, deps?: LocalScrapingToolDeps): void;
export {};
