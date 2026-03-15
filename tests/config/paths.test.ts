import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getJobJourneyPaths } from "../../src/config/paths.js";

describe("getJobJourneyPaths", () => {
  it("returns the expected paths for an explicit home directory", () => {
    const paths = getJobJourneyPaths("/tmp/test-home");

    expect(paths.dataDir).toBe("/tmp/test-home/.jobjourney");
    expect(paths.dbPath).toBe("/tmp/test-home/.jobjourney/jobs.db");
    expect(paths.heartbeatPath).toBe("/tmp/test-home/.jobjourney/agent-heartbeat.json");
  });

  it("defaults to the current home directory", () => {
    const homeDir = os.homedir();
    const paths = getJobJourneyPaths();

    expect(paths.dataDir).toBe(path.join(homeDir, ".jobjourney"));
    expect(paths.dataDir).toContain(".jobjourney");
    expect(paths.dbPath).toBe(path.join(homeDir, ".jobjourney", "jobs.db"));
    expect(paths.heartbeatPath).toBe(path.join(homeDir, ".jobjourney", "agent-heartbeat.json"));
  });
});
