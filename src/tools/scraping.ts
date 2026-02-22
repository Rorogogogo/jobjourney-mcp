import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerScrapingTools(server: FastMCP) {
  server.addTool({
    name: "get_scraping_stats",
    description: "View job scraping statistics from the browser extension.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/scraping-statistics")) as {
        data?: {
          totalJobsScraped?: number; totalSessions?: number;
          websites?: Array<{ name: string; jobCount: number }>;
        };
      };

      const stats = data.data;
      if (!stats) return "Could not retrieve scraping statistics.";

      const websites = stats.websites?.map((w, i) => `  ${i + 1}. ${w.name}: ${w.jobCount} jobs`).join("\n") || "  None";

      return [
        "Scraping Statistics",
        `Total jobs scraped: ${stats.totalJobsScraped ?? 0}`,
        `Total sessions: ${stats.totalSessions ?? 0}`,
        `\nBy Website:\n${websites}`,
      ].join("\n");
    },
  });

  server.addTool({
    name: "get_scraping_stats_aggregated",
    description: "View aggregated scraping statistics with breakdowns by website and time period.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/scraping-statistics/aggregated")) as {
        data?: unknown;
      };

      if (!data.data) return "Could not retrieve aggregated scraping statistics.";
      return typeof data.data === "string" ? data.data : JSON.stringify(data.data, null, 2);
    },
  });
}
