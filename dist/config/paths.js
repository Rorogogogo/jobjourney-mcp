import os from "node:os";
import path from "node:path";
export function getJobJourneyPaths(homeDir = os.homedir()) {
    const dataDir = path.join(homeDir, ".jobjourney");
    return {
        dataDir,
        dbPath: path.join(dataDir, "jobs.db"),
        heartbeatPath: path.join(dataDir, "agent-heartbeat.json"),
    };
}
