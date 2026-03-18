import { FastMCP } from "fastmcp";
import { openDatabase } from "../storage/sqlite/db.js";
import { ensureAgentRunning } from "../agent/process.js";
import { loginToSite, hasCookies } from "../scraper/core/browser.js";
import type { SessionAuth } from "../types.js";
import { runDiscovery } from "../discovery/core/run-discovery.js";
import { getActiveDiscoverySourceNames } from "../discovery/sources/registry.js";
interface LocalScrapingToolDeps {
    runDiscovery?: typeof runDiscovery;
    getActiveDiscoverySourceNames?: typeof getActiveDiscoverySourceNames;
    openDatabase?: typeof openDatabase;
    ensureAgentRunning?: typeof ensureAgentRunning;
    loginToSite?: typeof loginToSite;
    hasCookies?: typeof hasCookies;
    checkPlaywrightReady?: typeof checkPlaywrightReady;
    checkForUpdates?: typeof checkForUpdates;
}
export declare function registerLocalScrapingTools(server: FastMCP<SessionAuth>, deps?: LocalScrapingToolDeps): void;
declare function checkPlaywrightReady(): Promise<{
    ready: boolean;
    details: string;
}>;
declare function checkForUpdates(): Promise<{
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    error: string;
}>;
export {};
