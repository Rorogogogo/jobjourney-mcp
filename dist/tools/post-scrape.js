import { spawn } from "node:child_process";
import { apiCall } from "../api.js";
export async function onScrapeComplete(result) {
    try {
        const apiKey = process.env.JOBJOURNEY_API_KEY;
        // 1. Notify backend
        if (apiKey) {
            try {
                await apiCall("/api/scrape-run/complete", {
                    method: "POST",
                    body: JSON.stringify({
                        runId: String(result.runId),
                        keyword: result.keyword,
                        location: result.location,
                        sources: result.sources,
                        totalJobs: result.totalJobs,
                        topJobs: result.jobs.slice(0, 5).map((j) => ({
                            title: j.title,
                            company: j.company,
                            location: j.location,
                        })),
                    }),
                }, apiKey);
            }
            catch {
                // silently ignore — console.error corrupts stdio MCP transport
            }
        }
        // 2. Exchange API key for JWT so the browser auto-logs in
        let authToken = null;
        if (apiKey) {
            try {
                const data = (await apiCall("/api/auth/exchange-api-key", { method: "POST" }, apiKey));
                if (data.token) {
                    authToken = data.token;
                }
            }
            catch {
                // graceful fallback — open browser without auto-login
            }
        }
        // 3. Open browser (detached so it survives regardless of parent state)
        const clientUrl = "https://www.jobjourney.me";
        const params = new URLSearchParams({
            runId: String(result.runId),
            source: "local",
        });
        if (authToken) {
            params.set("token", authToken);
        }
        const url = `${clientUrl}/job-market?${params.toString()}`;
        const cmd = process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
                ? "cmd"
                : "xdg-open";
        const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
        const child = spawn(cmd, args, {
            detached: true,
            stdio: "ignore",
        });
        child.unref();
    }
    catch {
        // never let post-scrape errors propagate — they would become unhandled rejections
    }
}
