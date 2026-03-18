import { AgentScheduler } from "./scheduler.js";
import { writeHeartbeat } from "./heartbeat.js";

const RECONCILE_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

async function main(): Promise<void> {
  console.log("[agent] starting jobjourney-agent");

  const homeDir = process.env.JOBJOURNEY_HOME;
  const scheduler = new AgentScheduler();

  // Initial reconciliation
  scheduler.reconcile();
  writeHeartbeat(homeDir);

  // Periodic reconciliation
  setInterval(() => {
    try {
      scheduler.reconcile();
    } catch (error) {
      console.error("[agent] reconciliation error:", error);
    }
  }, RECONCILE_INTERVAL_MS);

  // Periodic heartbeat
  setInterval(() => {
    try {
      writeHeartbeat(homeDir);
    } catch (error) {
      console.error("[agent] heartbeat error:", error);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("[agent] shutting down");
    scheduler.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(
    "[agent] running, reconcile every",
    RECONCILE_INTERVAL_MS / 1000,
    "s",
  );
}

main().catch((error) => {
  console.error("[agent] fatal:", error);
  process.exit(1);
});
