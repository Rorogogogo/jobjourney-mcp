import { z } from "zod";
import { apiCall } from "../api.js";
export function registerDashboardTools(server) {
    server.addTool({
        name: "get_dashboard_stats",
        description: "Get an overview of the user's job search progress including job counts by status, scraping metrics, document counts, and feature usage. Great for answering 'how is my job search going?'",
        parameters: z.object({}),
        execute: async (_args, context) => {
            const apiKey = context.session?.apiKey;
            const stats = (await apiCall("/api/dashboard/statistics", {}, apiKey));
            if (stats.errorCode)
                return "Could not retrieve dashboard statistics.";
            const js = stats.jobStatistics;
            const sm = stats.scrapingMetrics;
            const ds = stats.documentStatistics;
            return [
                "Job Search Dashboard",
                "═══════════════════════",
                "",
                "Jobs Overview:",
                js ? `  Total: ${js.total} | Applied: ${js.applied} | Initial Interview: ${js.initialInterview} | Final Interview: ${js.finalInterview}` : null,
                js ? `  Offers: ${js.offer} | Rejected: ${js.rejected} | Starred: ${js.starred}` : null,
                "",
                sm ? `Scraping: ${sm.totalJobsScraped} jobs scraped` : null,
                ds ? `Documents: ${ds.totalCvs} CVs, ${ds.totalCoverLetters} cover letters` : null,
                stats.portfolioMetrics ? `Portfolio: ${stats.portfolioMetrics.visitCount} visits` : null,
            ].filter(Boolean).join("\n");
        },
    });
}
