import { FastMCP } from "fastmcp";
import { chromium } from "playwright";
import { z } from "zod";
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
import { PLUGIN_NAME, PLUGIN_VERSION } from "../version.js";
import { onScrapeComplete } from "./post-scrape.js";

interface LocalScrapingToolDeps {
  runDiscovery?: typeof runDiscovery;
  getActiveDiscoverySourceNames?: typeof getActiveDiscoverySourceNames;
  openDatabase?: typeof openDatabase;
  ensureAgentRunning?: typeof ensureAgentRunning;
  loginToSite?: typeof loginToSite;
  hasCookies?: typeof hasCookies;
  checkPlaywrightReady?: typeof checkPlaywrightReady;
  checkForUpdates?: typeof checkForUpdates;
}

export function registerLocalScrapingTools(
  server: FastMCP<SessionAuth>,
  deps: LocalScrapingToolDeps = {},
): void {
  const runDiscoveryImpl = deps.runDiscovery ?? runDiscovery;
  const getActiveDiscoverySourceNamesImpl =
    deps.getActiveDiscoverySourceNames ?? getActiveDiscoverySourceNames;
  const openDatabaseImpl = deps.openDatabase ?? openDatabase;
  const ensureAgentRunningImpl = deps.ensureAgentRunning ?? ensureAgentRunning;
  const loginToSiteImpl = deps.loginToSite ?? loginToSite;
  const hasCookiesImpl = deps.hasCookies ?? hasCookies;
  const checkPlaywrightReadyImpl = deps.checkPlaywrightReady ?? checkPlaywrightReady;
  const checkForUpdatesImpl = deps.checkForUpdates ?? checkForUpdates;
  const discoveryLogger = (_payload: Record<string, unknown>) => {
    // intentionally silent — console.error corrupts stdio MCP transport
  };

  server.addTool({
    name: "check_for_updates",
    description:
      "Check whether a newer published version of the local JobJourney plugin is available and show the update command.",
    parameters: z.object({}),
    execute: async () => {
      const result = await checkForUpdatesImpl();
      const latestVersion = result.latestVersion || "unavailable";
      const updateAvailable = result.error
        ? "unknown"
        : result.updateAvailable
          ? "yes"
          : "no";

      return [
        "# Plugin Update Status",
        `- Current version: ${result.currentVersion}`,
        `- Latest version: ${latestVersion}`,
        `- Update available: ${updateAvailable}`,
        result.error ? `- Check status: ${result.error}` : "",
        result.updateAvailable
          ? "- Update command: claude mcp remove jobjourney && claude mcp add jobjourney -e JOBJOURNEY_API_URL=https://server.jobjourney.me -e JOBJOURNEY_API_KEY=jj_your_api_key_here -e TRANSPORT=stdio -- npx -y jobjourney-claude-plugin"
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
  });

  server.addTool({
    name: "setup_local_scraping",
    description:
      "Prepare the local scraping environment. Initializes local SQLite, checks Playwright/browser readiness, starts the background agent if needed, reports login status for supported sites, and returns the next recommended commands.",
    parameters: z.object({}),
    execute: async () => {
      const db = openDatabaseImpl();
      try {
        const dbPath = getDatabasePath(db);
        const agentStarted = ensureAgentRunningImpl();
        const playwright = await checkPlaywrightReadyImpl();

        const seekLoggedIn = hasCookiesImpl("seek");
        const linkedinLoggedIn = hasCookiesImpl("linkedin");
        const missingSteps = [
          ...(playwright.ready ? [] : ["Run: npx playwright install chromium"]),
          ...(seekLoggedIn ? [] : ['Use login_jobsite with site "seek"']),
        ];

        return [
          "# Local Scraping Setup",
          "",
          `- Database: ready (${dbPath})`,
          `- Agent: ${agentStarted ? "started" : "already running"}`,
          `- Playwright: ${playwright.ready ? "ready" : "not ready"}`,
          playwright.details ? `- Playwright details: ${playwright.details}` : "",
          "",
          "## Login Status",
          `- seek: ${seekLoggedIn ? "login saved" : "login required"}`,
          `- linkedin: ${linkedinLoggedIn ? "login saved (optional for guest discovery)" : "not logged in (optional for guest discovery)"}`,
          "",
          "## Next Steps",
          ...(missingSteps.length ? missingSteps.map((step) => `- ${step}`) : ["- Local scraping is ready."]),
          '- Use discover_jobs with keyword "full stack", location "Sydney", sources ["linkedin", "seek"], pages 1',
        ]
          .filter(Boolean)
          .join("\n");
      } finally {
        db.close();
      }
    },
  });

  server.addTool({
    name: "discover_jobs",
    description:
      "Discover jobs across enabled sources (LinkedIn, SEEK, etc.), enrich them with ATS detection, expand career pages, and store results locally in SQLite. Returns a structured JSON summary.",
    annotations: { streamingHint: true },
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
        .describe("Number of pages to fetch per source (max 30). IMPORTANT: Always ask the user how many pages they want to scrape before calling this tool."),
      career_discovery: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When LinkedIn hides external apply URLs, probe company career pages to find ATS links (Greenhouse, Lever, etc.). Disabled by default because it probes many URLs and can cause timeouts in MCP clients.",
        ),
    }),
    execute: async (args, context) => {
      const db = openDatabaseImpl();
      try {
        const selectedSources = args.sources?.length
          ? args.sources
          : getActiveDiscoverySourceNamesImpl();
        const runsRepo = new ScrapeRunsRepo(db);
        const run = runsRepo.createRun({
          keyword: args.keyword,
          location: args.location,
          source: "discover",
          runMode: "discover",
          sources: selectedSources.join(","),
        });

        let jobsSoFar = 0;
        const totalPages = Math.min(args.pages ?? 30, 30);
        const stream = context?.streamContent?.bind(context);
        const report = context?.reportProgress?.bind(context);
        const sendProgress = (message: string) => {
          if (stream) {
            void stream({ type: "text", text: message + "\n" });
          }
          context?.log?.info?.(message);
        };
        const progressLogger = (payload: Record<string, unknown>) => {
          discoveryLogger(payload);
          const event = payload.event as string;
          switch (event) {
            case "discovery_source_start":
              sendProgress(
                `🔍 Starting ${payload.source} discovery: "${payload.keyword}" in ${payload.location} (${payload.pages} pages)`,
              );
              void report?.({ progress: 0, total: totalPages });
              break;
            case "discovery_source_page":
              sendProgress(
                `📄 ${payload.source}: page ${payload.page}/${payload.totalPages} — ${payload.jobsFound} jobs found so far`,
              );
              void report?.({ progress: payload.page as number, total: totalPages });
              break;
            case "discovery_source_success":
              jobsSoFar += (payload.discoveredJobs as number) || 0;
              sendProgress(
                `✅ ${payload.source}: found ${payload.discoveredJobs} jobs from search pages`,
              );
              void report?.({ progress: totalPages, total: totalPages });
              break;
            case "discovery_ats_expand_start":
              sendProgress(
                `🏢 Expanding ${payload.atsType} jobs for ${payload.companyIdentifier}...`,
              );
              break;
            case "discovery_ats_expand_success":
              jobsSoFar += (payload.discoveredJobs as number) || 0;
              sendProgress(
                `✅ ${payload.atsType}/${payload.companyIdentifier}: added ${payload.discoveredJobs} jobs (total so far: ${jobsSoFar})`,
              );
              break;
            case "career_discovery_probe":
              sendProgress(
                `🌐 Probing career page: ${payload.probeUrl}`,
              );
              break;
            case "career_discovery_result":
              if (payload.outcome === "ats_detected") {
                sendProgress(
                  `🎯 Found ${payload.atsType} ATS for ${payload.company} via career page`,
                );
              }
              break;
            case "discovery_source_error":
              sendProgress(
                `❌ ${payload.source} failed: ${payload.error}`,
              );
              break;
          }
        };

        try {
          const repo = new DiscoveryJobsRepo(db);
          let persistedCount = 0;
          const result = await runDiscoveryImpl(
            {
              keyword: args.keyword,
              location: args.location,
              sources: selectedSources as any,
              pages: totalPages,
              careerDiscovery: args.career_discovery ?? false,
            },
            {
              logger: progressLogger,
              onJobsBatch: (batchJobs) => {
                repo.upsertJobs(batchJobs, {
                  keyword: args.keyword,
                  location: args.location,
                  runId: run.id,
                });
                persistedCount += batchJobs.length;
                sendProgress(
                  `💾 Saved ${persistedCount} jobs to database so far`,
                );
              },
            },
          );
          // Persist any jobs not already saved by onJobsBatch (e.g. if caller
          // doesn't support the callback, or deduplication left stragglers).
          if (result.jobs.length > persistedCount) {
            repo.upsertJobs(result.jobs, {
              keyword: args.keyword,
              location: args.location,
              runId: run.id,
            });
          }
          runsRepo.finishRun(run.id, {
            status: "success",
            jobCount: result.jobs.length,
          });

          // Post-scrape: notify backend + open browser
          void onScrapeComplete({
            runId: run.id,
            keyword: args.keyword,
            location: args.location,
            sources: selectedSources,
            totalJobs: result.jobs.length,
            jobs: result.jobs.map((j) => ({
              title: j.title,
              company: j.company,
              location: j.location,
            })),
          });

          return JSON.stringify(
            {
              runId: run.id,
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          runsRepo.finishRun(run.id, {
            status: "error",
            error: message,
          });
          throw error;
        }
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
          return "No jobs found matching your criteria. Try running discover_jobs first to collect job listings.";
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
    name: "schedule_jobs",
    description:
      "Schedule recurring job discovery. The jobjourney-agent will run the discovery engine daily at the requested time across all specified sources and store results locally.",
    parameters: z.object({
      keyword: z.string().describe("Job search keyword, e.g. 'full stack'"),
      location: z.string().describe("Job location, e.g. 'Sydney'"),
      time: z.string().describe("Daily time to run in HH:mm format, e.g. '09:00'"),
      pages: z
        .number()
        .optional()
        .describe("Number of pages to fetch per source (max 30, default 30). IMPORTANT: Always ask the user how many pages they want to scrape before calling this tool."),
      sources: z
        .array(z.string())
        .optional()
        .describe(
          `Sources to discover from. Defaults to active sources: ${getActiveDiscoverySourceNamesImpl().join(", ")}`,
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
        const pages = Math.min(args.pages ?? 30, 30);
        const schedule = repo.create({
          keyword: args.keyword,
          location: args.location,
          source: "discover",
          sources: sourceList,
          pages,
          runMode: "discover",
          cron: cronExpr,
        });

        ensureAgentRunningImpl();

        return [
          `Scheduled "${args.keyword}" in ${args.location} every day at ${args.time}.`,
          `Sources: ${selectedSources.join(", ")}`,
          `Pages: ${pages}`,
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
          return "No discovery runs found. Run discover_jobs or schedule_jobs first.";
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

async function checkPlaywrightReady(): Promise<{ ready: boolean; details: string }> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    return {
      ready: true,
      details: "Chromium launch check succeeded.",
    };
  } catch (error) {
    return {
      ready: false,
      details: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser?.close();
  }
}

function getDatabasePath(db: ReturnType<typeof openDatabase>): string {
  const databases = db.prepare("PRAGMA database_list").all() as Array<{
    name: string;
    file: string;
  }>;
  return databases.find((entry) => entry.name === "main")?.file || "unknown";
}

async function checkForUpdates(): Promise<{
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  error: string;
}> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${PLUGIN_NAME}/latest`);
    if (!response.ok) {
      throw new Error(`Registry responded with ${response.status}`);
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version ?? "";
    return {
      currentVersion: PLUGIN_VERSION,
      latestVersion,
      updateAvailable: Boolean(latestVersion && latestVersion !== PLUGIN_VERSION),
      error: "",
    };
  } catch (error) {
    return {
      currentVersion: PLUGIN_VERSION,
      latestVersion: "",
      updateAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
