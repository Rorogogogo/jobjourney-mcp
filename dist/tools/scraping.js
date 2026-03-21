import { z } from "zod";
import { apiCall } from "../api.js";
export function registerScrapingTools(server) {
    server.addTool({
        name: "get_scraping_stats",
        description: "View job scraping statistics from the browser extension.",
        parameters: z.object({}),
        execute: async (_args, context) => {
            const apiKey = context.session?.apiKey;
            const data = (await apiCall("/api/scraping-statistics", {}, apiKey));
            const items = data.items || [];
            if (items.length === 0)
                return "No scraping statistics found.";
            const list = items.map((s, i) => `${i + 1}. ${s.jobTitle || "Unknown"} in ${s.location || "Unknown"} (${s.platforms || "N/A"})\n   Found: ${s.jobsFound} | Scraped: ${s.totalScrapedCount} | ${new Date(s.createdOnUtc).toLocaleDateString()}`).join("\n\n");
            return `Scraping Statistics (${data.totalCount || items.length} entries):\n\n${list}`;
        },
    });
    server.addTool({
        name: "get_scraping_stats_aggregated",
        description: "View aggregated scraping statistics with breakdowns by website and time period.",
        parameters: z.object({}),
        execute: async (_args, context) => {
            const apiKey = context.session?.apiKey;
            const data = (await apiCall("/api/scraping-statistics/aggregated", {}, apiKey));
            if (!data)
                return "Could not retrieve aggregated scraping statistics.";
            return `Aggregated Scraping Stats:\n  Total jobs found: ${data.jobsFound ?? 0}\n  Total scraped: ${data.totalScrapedCount ?? 0}`;
        },
    });
}
