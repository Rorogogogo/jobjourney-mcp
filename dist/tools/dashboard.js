import { z } from "zod";
import { apiCall } from "../api.js";
export function registerDashboardTools(server) {
    server.addTool({
        name: "get_dashboard_stats",
        description: "Get an overview of the user's job search progress including job counts by status, scraping metrics, document counts, and feature usage. Great for answering 'how is my job search going?'",
        parameters: z.object({}),
        execute: async () => {
            const data = (await apiCall("/api/dashboard/statistics"));
            const stats = data.data;
            if (!stats)
                return "Could not retrieve dashboard statistics.";
            const js = stats.jobStatistics;
            const sm = stats.scrapingMetrics;
            const ds = stats.documentStatistics;
            return [
                "Job Search Dashboard",
                "═══════════════════════",
                "",
                "Jobs Overview:",
                js ? `  Total: ${js.total} | Applied: ${js.applied} | Interview: ${js.interview}` : null,
                js ? `  Offers: ${js.offer} | Rejected: ${js.rejected} | Starred: ${js.starred}` : null,
                "",
                sm ? `Scraping: ${sm.totalJobsScraped} jobs scraped from ${sm.totalWebsites} websites` : null,
                ds ? `Documents: ${ds.totalCvs} CVs, ${ds.totalCoverLetters} cover letters` : null,
                stats.portfolioMetrics ? `Portfolio: ${stats.portfolioMetrics.visitsThisMonth} visits this month` : null,
            ].filter(Boolean).join("\n");
        },
    });
}
