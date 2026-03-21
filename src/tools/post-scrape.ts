import { execFile } from "node:child_process";
import { apiCall } from "../api.js";

export interface ScrapeResult {
  runId: number;
  keyword: string;
  location: string;
  sources: string[];
  totalJobs: number;
  jobs: Array<{ title: string; company: string; location: string }>;
}

export async function onScrapeComplete(result: ScrapeResult): Promise<void> {
  const apiKey = process.env.JOBJOURNEY_API_KEY;

  // 1. Notify backend (apiCall reads JOBJOURNEY_API_URL from env automatically)
  if (apiKey) {
    try {
      await apiCall(
        "/scrape-run/complete",
        {
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
        },
        apiKey,
      );
    } catch (error) {
      console.error("[post-scrape] Backend notification failed:", error);
    }
  }

  // 2. Open browser
  const clientUrl = "https://client.robert-personal-website.com";
  const url = `${clientUrl}/job-market?runId=${result.runId}&source=local`;

  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  execFile(cmd, args, () => {
    // silently ignore errors
  });
}
