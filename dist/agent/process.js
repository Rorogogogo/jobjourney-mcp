import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAgentHealthy } from "./heartbeat.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function ensureAgentRunning(homeDir) {
    if (isAgentHealthy({ homeDir })) {
        return false; // already running
    }
    const agentEntry = path.resolve(__dirname, "index.js");
    const child = spawn(process.execPath, [agentEntry], {
        detached: true,
        stdio: "ignore",
        env: {
            ...process.env,
            ...(homeDir ? { JOBJOURNEY_HOME: homeDir } : {}),
        },
    });
    child.unref();
    return true; // spawned
}
