import { FastMCP } from "fastmcp";
import { z } from "zod";
import { runScrape, getAvailableSources } from "../scraper/core/run-scrape.js";
import { openDatabase } from "../storage/sqlite/db.js";
import { JobsRepo } from "../storage/sqlite/jobs-repo.js";
import { SchedulesRepo } from "../storage/sqlite/schedules-repo.js";
import { ensureAgentRunning } from "../agent/process.js";
import { loginToSite, hasCookies } from "../scraper/core/browser.js";
import type { SessionAuth } from "../types.js";

export function registerLocalScrapingTools(server: FastMCP<SessionAuth>): void {
  server.addTool({
    name: "scrape_jobs",
    description:
      "Run a one-off local job scrape using Playwright. Scrapes job listings from the specified source and stores them locally in SQLite. Returns results as Markdown.",
    parameters: z.object({
      keyword: z.string().describe("Job search keyword, e.g. 'AI Engineer'"),
      location: z.string().describe("Job location, e.g. 'Sydney'"),
      source: z
        .string()
        .optional()
        .default("seek")
        .describe(`Job source to scrape. Available: ${getAvailableSources().join(", ")}`),
      maxPages: z
        .number()
        .optional()
        .default(1)
        .describe("Number of pages to scrape (default 1, max 30)"),
    }),
    execute: async (args) => {
      const result = await runScrape({
        keyword: args.keyword,
        location: args.location,
        source: args.source,
        maxPages: Math.min(args.maxPages, 30),
      });
      return result.markdown;
    },
  });

  server.addTool({
    name: "search_jobs",
    description:
      "Search locally stored jobs from previous scrapes. Returns matching jobs from the local SQLite database.",
    parameters: z.object({
      keyword: z.string().optional().describe("Search by job title or company name"),
      location: z.string().optional().describe("Filter by location"),
      source: z.string().optional().describe("Filter by source (e.g. seek, linkedin)"),
      limit: z.number().optional().default(20).describe("Max results to return (default 20)"),
    }),
    execute: async (args) => {
      const db = openDatabase();
      try {
        const repo = new JobsRepo(db);
        const jobs = repo.search({
          keyword: args.keyword,
          location: args.location,
          source: args.source,
          limit: args.limit,
        });

        if (jobs.length === 0) {
          return "No jobs found matching your criteria. Try running scrape_jobs first to collect job listings.";
        }

        const lines = jobs.map((job: any) =>
          [
            `## ${job.title}`,
            `- Company: ${job.company}`,
            `- Location: ${job.location}`,
            `- Source: ${job.source}`,
            `- Link: ${job.url}`,
            `- Scraped: ${job.scraped_at}`,
          ].join("\n")
        );

        return [`# Search Results (${jobs.length} jobs)`, "", ...lines].join("\n\n");
      } finally {
        db.close();
      }
    },
  });

  server.addTool({
    name: "schedule_scraping",
    description:
      "Schedule recurring local job scraping. Creates a schedule that runs automatically via the jobjourney-agent background process.",
    parameters: z.object({
      keyword: z.string().describe("Job search keyword, e.g. 'AI Engineer'"),
      location: z.string().describe("Job location, e.g. 'Sydney'"),
      time: z
        .string()
        .describe("Daily time to run in HH:mm format, e.g. '09:00'"),
      source: z
        .string()
        .optional()
        .default("seek")
        .describe(`Job source. Available: ${getAvailableSources().join(", ")}`),
    }),
    execute: async (args) => {
      const [hourStr, minuteStr] = args.time.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return `Invalid time format: ${args.time}. Use HH:mm (e.g. '09:00').`;
      }

      const cronExpr = `${minute} ${hour} * * *`;

      const db = openDatabase();
      try {
        const repo = new SchedulesRepo(db);
        const schedule = repo.create({
          keyword: args.keyword,
          location: args.location,
          source: args.source,
          cron: cronExpr,
        });

        ensureAgentRunning();

        return [
          `Scheduled "${args.keyword}" in ${args.location} (${args.source}) every day at ${args.time}.`,
          `Schedule ID: ${schedule.id}`,
          `Cron: ${cronExpr}`,
          `The jobjourney-agent background process will execute this automatically.`,
        ].join("\n");
      } finally {
        db.close();
      }
    },
  });

  server.addTool({
    name: "login_jobsite",
    description:
      "Open a browser window for the user to log in to a job site (SEEK or LinkedIn). Saves cookies so future scrapes can access full job details including descriptions, salary, and applied status. Run this once per site before scraping.",
    parameters: z.object({
      site: z
        .string()
        .describe("Job site to log in to: 'seek' or 'linkedin'"),
    }),
    execute: async (args) => {
      return await loginToSite(args.site);
    },
  });

  server.addTool({
    name: "check_login_status",
    description:
      "Check if cookies exist for job sites. Shows which sites have saved login sessions.",
    parameters: z.object({}),
    execute: async () => {
      const sites = ["seek", "linkedin"];
      const status = sites.map(
        (s) => `- ${s}: ${hasCookies(s) ? "logged in (cookies saved)" : "not logged in"}`,
      );
      return ["# Login Status", "", ...status].join("\n");
    },
  });
}
