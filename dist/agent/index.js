import { AgentScheduler } from "./scheduler.js";
import { writeHeartbeat } from "./heartbeat.js";
import { createSignalRClient } from "./signalr-client.js";
import { startSignalRSupervisor } from "./signalr-supervisor.js";
const RECONCILE_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
async function main() {
    console.log("[agent] starting jobjourney-agent");
    const homeDir = process.env.JOBJOURNEY_HOME;
    const apiUrl = process.env.JOBJOURNEY_API_URL;
    const apiKey = process.env.JOBJOURNEY_API_KEY;
    const scheduler = new AgentScheduler();
    // Initial reconciliation
    scheduler.reconcile();
    writeHeartbeat(homeDir);
    // Periodic reconciliation
    setInterval(() => {
        try {
            scheduler.reconcile();
        }
        catch (error) {
            console.error("[agent] reconciliation error:", error);
        }
    }, RECONCILE_INTERVAL_MS);
    // Periodic heartbeat
    setInterval(() => {
        try {
            writeHeartbeat(homeDir);
        }
        catch (error) {
            console.error("[agent] heartbeat error:", error);
        }
    }, HEARTBEAT_INTERVAL_MS);
    // SignalR connection to backend
    let signalrSupervisor = null;
    if (apiUrl && apiKey) {
        signalrSupervisor = startSignalRSupervisor(() => createSignalRClient({ apiUrl, apiKey }), {
            logError: (error) => {
                console.error("[agent] Failed to connect SignalR:", error);
            },
        });
    }
    else {
        console.log("[agent] JOBJOURNEY_API_URL or JOBJOURNEY_API_KEY not set, skipping SignalR");
    }
    // Graceful shutdown
    const shutdown = () => {
        console.log("[agent] shutting down");
        scheduler.stop();
        void signalrSupervisor?.stop().catch(() => { });
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.log("[agent] running, reconcile every", RECONCILE_INTERVAL_MS / 1000, "s");
}
main().catch((error) => {
    console.error("[agent] fatal:", error);
    process.exit(1);
});
