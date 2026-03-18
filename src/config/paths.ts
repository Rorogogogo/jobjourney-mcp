import os from "node:os";
import path from "node:path";

export interface JobJourneyPaths {
  dataDir: string;
  dbPath: string;
  heartbeatPath: string;
}

export function getJobJourneyPaths(homeDir = os.homedir()): JobJourneyPaths {
  const dataDir = path.join(homeDir, ".jobjourney");

  return {
    dataDir,
    dbPath: path.join(dataDir, "jobs.db"),
    heartbeatPath: path.join(dataDir, "agent-heartbeat.json"),
  };
}
