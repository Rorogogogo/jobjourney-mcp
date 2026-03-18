import { describe, expect, it, beforeEach } from "vitest";
import { writeHeartbeat, readHeartbeat, isAgentHealthy } from "../../src/agent/heartbeat.js";
import { createTmpHome } from "../helpers/tmp-home.js";

describe("heartbeat", () => {
  let home: string;

  beforeEach(() => {
    home = createTmpHome();
  });

  it("writes and reads heartbeat", () => {
    writeHeartbeat(home);
    const hb = readHeartbeat(home);
    expect(hb).not.toBeNull();
    expect(hb!.pid).toBe(process.pid);
    expect(hb!.updatedAt).toBeTruthy();
  });

  it("returns null when no heartbeat exists", () => {
    const hb = readHeartbeat(home);
    expect(hb).toBeNull();
  });

  it("reports a stale heartbeat as not healthy", () => {
    writeHeartbeat(home);
    // Check with a "now" far in the future
    const healthy = isAgentHealthy({
      homeDir: home,
      now: "2099-01-01T00:00:00.000Z",
      maxAgeMs: 30_000,
    });
    expect(healthy).toBe(false);
  });

  it("reports a fresh heartbeat as healthy", () => {
    writeHeartbeat(home);
    const healthy = isAgentHealthy({ homeDir: home, maxAgeMs: 60_000 });
    expect(healthy).toBe(true);
  });
});
