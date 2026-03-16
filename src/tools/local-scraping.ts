import { FastMCP } from "fastmcp";
import { z } from "zod";
import { runScrape, getAvailableSources } from "../scraper/core/run-scrape.js";
import { openDatabase } from "../storage/sqlite/db.js";
import { JobsRepo } from "../storage/sqlite/jobs-repo.js";
import { SchedulesRepo } from "../storage/sqlite/schedules-repo.js";
import { ScrapeRunsRepo } from "../storage/sqlite/scrape-runs-repo.js";
import { ensureAgentRunning } from "../agent/process.js";
import { loginToSite, hasCookies } from "../scraper/core/browser.js";
import type { SessionAuth } from "../types.js";
import { runDiscovery } from "../discovery/core/run-discovery.js";
import { getActiveDiscoverySourceNames } from "../discovery/sources/registry.js";
import { DiscoveryJobsRepo } from "../discovery/storage/discovery-jobs-repo.js";

interface LocalScrapingToolDeps {
  runScrape?: typeof runScrape;
  getAvailableSources?: typeof getAvailableSources;
  runDiscovery?: typeof runDiscovery;
  getActiveDiscoverySourceNames?: typeof getActiveDiscoverySourceNames;
  openDatabase?: typeof openDatabase;
  ensureAgentRunning?: typeof ensureAgentRunning;
  loginToSite?: typeof loginToSite;
  hasCookies?: typeof hasCookies;
}

export function registerLocalScrapingTools(
  server: FastMCP<SessionAuth>,
  deps: LocalScrapingToolDeps = {},
): void {
  const runScrapeImpl = deps.runScrape ?? runScrape;
  const getAvailableSourcesImpl = deps.getAvailableSources ?? getAvailableSources;
  const runDiscoveryImpl = deps.runDiscovery ?? runDiscovery;
  const getActiveDiscoverySourceNamesImpl =
    deps.getActiveDiscoverySourceNames ?? getActiveDiscoverySourceNames;
  const openDatabaseImpl = deps.openDatabase ?? openDatabase;
  const ensureAgentRunningImpl = deps.ensureAgentRunning ?? ensureAgentRunning;
  const loginToSiteImpl = deps.loginToSite ?? loginToSite;
  const hasCookiesImpl = deps.hasCookies ?? hasCookies;
  const discoveryLogger = (payload: Record<string, unknown>) => {
    console.log(`[discover] ${JSON.stringify(payload)}`);
  };

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
        .describe(`Job source to scrape. Available: ${getAvailableSourcesImpl().join(", ")}`),
      maxPages: z
        .number()
        .optional()
        .default(1)
        .describe("Number of pages to scrape (default 1, max 30)"),
    }),
    execute: async (args) => {
      const result = await runScrapeImpl({
        keyword: args.keyword,
        location: args.location,
        source: args.source,
        maxPages: Math.min(args.maxPages, 30),
      });
      return result.markdown;
    },
  });

  server.addTool({
    name: "discover_jobs",
    description:
      "Run the new multi-source discovery engine. Discovers jobs across enabled sources, enriches them, expands supported ATS providers, stores them locally in SQLite, and returns a structured JSON summary.",
    parameters: z.object({
      keyword: z.string().describe("Job search keyword, e.g. 'full stack'"),
      location: z.string().describe("Job location, e.g. 'Sydney'"),
      sources: z
        .array(z.string())
        .optional()
        .describe(
          `Discovery sources to run. Defaults to active sources: ${getActiveDiscoverySourceNamesImpl().join(", ")}`,
        ),
      pages: z
        .number()
        .optional()
        .default(30)
        .describe("Number of pages to fetch per source (default 30, max 30)"),
    }),
    execute: async (args) => {
      const db = openDatabaseImpl();
      try {
        const result = await runDiscoveryImpl({
          keyword: args.keyword,
          location: args.location,
          sources: args.sources as any,
          pages: Math.min(args.pages, 30),
        }, {
          logger: discoveryLogger,
        });
        const repo = new DiscoveryJobsRepo(db);
        repo.upsertJobs(result.jobs, {
          keyword: args.keyword,
          location: args.location,
        });

        return JSON.stringify(
          {
            keyword: args.keyword,
            location: args.location,
            totalJobs: result.jobs.length,
            successfulSources: result.sources,
            failedSources: result.failedSources,
            expandedCompanies: result.expandedCompanies,
            jobs: result.jobs.map((job) => ({
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              source: job.source,
              jobUrl: job.jobUrl,
              externalUrl: job.externalUrl,
              atsType: job.atsType,
              postedAt: job.postedAt,
            })),
          },
          null,
          2,
        );
      } finally {
        db.close();
      }
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
      const db = openDatabaseImpl();
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
            `- Job URL: ${job.job_url ?? job.url}`,
            `- External URL: ${job.external_url ?? ""}`,
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
        .describe(`Job source. Available: ${getAvailableSourcesImpl().join(", ")}`),
    }),
    execute: async (args) => {
      const [hourStr, minuteStr] = args.time.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return `Invalid time format: ${args.time}. Use HH:mm (e.g. '09:00').`;
      }

      const cronExpr = `${minute} ${hour} * * *`;

      const db = openDatabaseImpl();
      try {
        const repo = new SchedulesRepo(db);
        const schedule = repo.create({
          keyword: args.keyword,
          location: args.location,
          source: args.source,
          cron: cronExpr,
        });

        ensureAgentRunningImpl();

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
    name: "schedule_discovery",
    description:
      "Schedule recurring multi-source discovery. The jobjourney-agent will run the TS discovery engine daily at the requested time and store results locally.",
    parameters: z.object({
      keyword: z.string().describe("Job search keyword, e.g. 'full stack'"),
      location: z.string().describe("Job location, e.g. 'Sydney'"),
      time: z.string().describe("Daily time to run in HH:mm format, e.g. '09:00'"),
      sources: z
        .array(z.string())
        .optional()
        .describe(
          `Discovery sources to run. Defaults to active sources: ${getActiveDiscoverySourceNamesImpl().join(", ")}`,
        ),
    }),
    execute: async (args) => {
      const [hourStr, minuteStr] = args.time.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return `Invalid time format: ${args.time}. Use HH:mm (e.g. '09:00').`;
      }

      const cronExpr = `${minute} ${hour} * * *`;
      const selectedSources = args.sources?.length
        ? args.sources
        : getActiveDiscoverySourceNamesImpl();
      const sourceList = selectedSources.join(",");

      const db = openDatabaseImpl();
      try {
        const repo = new SchedulesRepo(db);
        const schedule = repo.create({
          keyword: args.keyword,
          location: args.location,
          source: "discover",
          sources: sourceList,
          runMode: "discover",
          cron: cronExpr,
        });

        ensureAgentRunningImpl();

        return [
          `Scheduled discovery for "${args.keyword}" in ${args.location} every day at ${args.time}.`,
          `Sources: ${selectedSources.join(", ")}`,
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
    name: "get_latest_discovery_report",
    description:
      "Show a summary of the most recent discovery run, including sources, job count, and the top stored jobs for that run.",
    parameters: z.object({}),
    execute: async () => {
      const db = openDatabaseImpl();
      try {
        const runsRepo = new ScrapeRunsRepo(db);
        const latestRun = runsRepo.getLatestDiscoveryRun();
        if (!latestRun) {
          return "No discovery runs found. Run discover_jobs or schedule_discovery first.";
        }

        const jobs = db
          .prepare(
            `SELECT title, company, location, source, COALESCE(job_url, url) AS job_url, external_url, ats_type
             FROM jobs
             WHERE run_id = ?
             ORDER BY rowid ASC
             LIMIT 10`,
          )
          .all(latestRun.id) as Array<{
          title: string;
          company: string;
          location: string;
          source: string;
          job_url: string;
          external_url: string | null;
          ats_type: string | null;
        }>;

        const lines = jobs.map((job) =>
          [
            `## ${job.title}`,
            `- Company: ${job.company}`,
            `- Location: ${job.location}`,
            `- Source: ${job.source}`,
            `- ATS: ${job.ats_type ?? "unknown"}`,
            `- Job URL: ${job.job_url}`,
            `- External URL: ${job.external_url ?? ""}`,
          ].join("\n"),
        );

        return [
          "# Latest Discovery Run",
          `- Keyword: ${latestRun.keyword}`,
          `- Location: ${latestRun.location}`,
          `- Sources: ${(latestRun.sources ?? latestRun.source).split(",").join(", ")}`,
          `- Status: ${latestRun.status}`,
          `- Job count: ${latestRun.job_count ?? 0}`,
          `- Started: ${latestRun.started_at}`,
          latestRun.finished_at ? `- Finished: ${latestRun.finished_at}` : "",
          "",
          ...lines,
        ]
          .filter(Boolean)
          .join("\n\n");
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
      return await loginToSiteImpl(args.site);
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
        (s) => `- ${s}: ${hasCookiesImpl(s) ? "logged in (cookies saved)" : "not logged in"}`,
      );
      return ["# Login Status", "", ...status].join("\n");
    },
  });
}
