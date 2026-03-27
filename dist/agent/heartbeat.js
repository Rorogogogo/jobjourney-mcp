import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getJobJourneyPaths } from "../config/paths.js";
export function writeHeartbeat(homeDir) {
    const paths = getJobJourneyPaths(homeDir);
    mkdirSync(path.dirname(paths.heartbeatPath), { recursive: true });
    const data = {
        pid: process.pid,
        updatedAt: new Date().toISOString(),
    };
    writeFileSync(paths.heartbeatPath, JSON.stringify(data, null, 2));
}
export function readHeartbeat(homeDir) {
    const paths = getJobJourneyPaths(homeDir);
    try {
        const raw = readFileSync(paths.heartbeatPath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function isAgentHealthy(options) {
    const maxAge = options?.maxAgeMs ?? 60_000;
    const now = options?.now ? new Date(options.now).getTime() : Date.now();
    const heartbeat = readHeartbeat(options?.homeDir);
    if (!heartbeat)
        return false;
    const updatedAt = new Date(heartbeat.updatedAt).getTime();
    return now - updatedAt < maxAge;
}
