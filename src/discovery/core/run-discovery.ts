import { enrichDiscoveryJob } from "../analysis/enrichment.js";
import { GreenhouseCrawler } from "../ats/greenhouse.js";
import { LeverCrawler } from "../ats/lever.js";
import { detectAts } from "../ats/detector.js";
import {
  CompanyCareerDiscoverer,
  getCachedCareerDiscoveryResult,
  shouldRunCareerDiscovery,
} from "../fallback/company-site.js";
import { HttpClient } from "../utils/http.js";
import { RateLimiter } from "../utils/rate-limit.js";
import { LinkedInGuestSource } from "../sources/linkedin-guest.js";
import { SeekBrowserSource } from "../sources/seek-browser.js";
import { IndeedBrowserSource } from "../sources/indeed-browser.js";
import { JoraBrowserSource } from "../sources/jora-browser.js";
import { getActiveDiscoverySourceNames } from "../sources/registry.js";
import { crossPlatformDedupKey, jobRichness } from "./normalize.js";
import type { DiscoverySourceRunner } from "../sources/base.js";
import type { AtsProviderName } from "../ats/registry.js";
import type { DiscoveryJob, DiscoveryRunOptions, DiscoveryRunResult, DiscoverySourceName } from "./types.js";
import type { CompanyCareerDiscovererLike } from "../fallback/company-site.js";

export interface AtsCrawlerRunner {
  name: AtsProviderName;
  crawlJobs(companyIdentifier: string, extractedAt: string): Promise<DiscoveryJob[]>;
}

export interface RunDiscoveryDependencies {
  sourceFactories?: Partial<Record<DiscoverySourceName, () => DiscoverySourceRunner>>;
  atsCrawlerFactories?: Partial<Record<AtsProviderName, () => AtsCrawlerRunner>>;
  extractedAt?: () => string;
  httpClient?: HttpClient;
  careerDiscoverer?: CompanyCareerDiscovererLike;
  logger?: (payload: Record<string, unknown>) => void;
  /** Called after each source completes with its batch of jobs, enabling incremental persistence. */
  onJobsBatch?: (jobs: DiscoveryJob[], source: DiscoverySourceName) => void;
}

export async function runDiscovery(
  options: DiscoveryRunOptions,
  dependencies: RunDiscoveryDependencies = {},
): Promise<DiscoveryRunResult> {
  const selectedSources = options.sources ?? getActiveDiscoverySourceNames();
  const logger = dependencies.logger;
  const httpClient =
    dependencies.httpClient ??
    new HttpClient({
      rateLimiter: new RateLimiter({
        minDelay: options.minDelay,
        maxDelay: options.maxDelay,
      }),
    });
  const sourceFactories = {
    ...createDefaultSourceFactories(httpClient),
    ...(dependencies.sourceFactories ?? {}),
  };
  const atsCrawlerFactories = {
    ...createDefaultAtsCrawlerFactories(httpClient),
    ...(dependencies.atsCrawlerFactories ?? {}),
  };
  const extractedAtFactory =
    dependencies.extractedAt ??
    (() => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  const careerDiscoverer =
    dependencies.careerDiscoverer ??
    (options.careerDiscovery
      ? new CompanyCareerDiscoverer(httpClient, {
          careerPaths: options.careerPaths,
          maxProbes: options.careerDiscoveryMaxProbes,
          logger: dependencies.logger,
        })
      : null);

  const jobs: DiscoveryJob[] = [];
  const successfulSources: DiscoverySourceName[] = [];
  const failedSources: DiscoverySourceName[] = [];
  const expandedCompanies: string[] = [];
  const expandedCompanyKeys = new Set<string>();
  const careerDiscoveryCache = new Map<string, unknown>();
  const seenJobs = new Set<string>();
  /** Maps normalized company+title → index in `jobs` array for cross-platform dedup. */
  const crossPlatformSeen = new Map<string, number>();
  const sourceResults = await mapWithConcurrency(
    selectedSources,
    2,
    async (sourceName): Promise<SourceRunResult> => {
      const factory = sourceFactories[sourceName];
      if (!factory) {
        return {
          sourceName,
          success: false,
          jobs: [],
          expandedCompanies: [],
        };
      }

      logger?.({
        event: "discovery_source_start",
        source: sourceName,
        keyword: options.keyword,
        location: options.location,
        pages: options.pages ?? 30,
      });

      try {
        const source = factory();
        const discoveredJobs = await source.discoverJobs({
          keyword: options.keyword,
          location: options.location,
          pages: options.pages ?? 30,
          extractedAt: extractedAtFactory(),
          onProgress: (info) => {
            logger?.({
              event: "discovery_source_page",
              source: sourceName,
              page: info.page,
              totalPages: info.totalPages,
              jobsFound: info.jobsFound,
            });
          },
        });
        logger?.({
          event: "discovery_source_success",
          source: sourceName,
          discoveredJobs: discoveredJobs.length,
        });

        const sourceJobs: DiscoveryJob[] = [];
        const sourceExpandedCompanies: string[] = [];

        for (const job of discoveredJobs) {
          const enriched = enrichDiscoveryJob(
            await maybeApplyCareerDiscovery(
              applyAtsDetection(job),
              options,
              careerDiscoverer,
              careerDiscoveryCache,
              logger,
            ),
          );
          sourceJobs.push(enriched);

          if (!isSupportedAts(enriched.atsType) || !enriched.atsIdentifier) {
            continue;
          }

          const companyKey = `${enriched.atsType}:${enriched.atsIdentifier}`;
          if (expandedCompanyKeys.has(companyKey)) {
            continue;
          }

          const crawlerFactory = atsCrawlerFactories[enriched.atsType];
          if (!crawlerFactory) {
            continue;
          }

          expandedCompanyKeys.add(companyKey);
          sourceExpandedCompanies.push(companyKey);
          logger?.({
            event: "discovery_ats_expand_start",
            source: enriched.source,
            atsType: enriched.atsType,
            companyIdentifier: enriched.atsIdentifier,
          });
          const atsJobs = await crawlerFactory().crawlJobs(
            enriched.atsIdentifier,
            extractedAtFactory(),
          );
          logger?.({
            event: "discovery_ats_expand_success",
            source: enriched.source,
            atsType: enriched.atsType,
            companyIdentifier: enriched.atsIdentifier,
            discoveredJobs: atsJobs.length,
          });
          for (const atsJob of atsJobs) {
            atsJob.source = enriched.source;
            atsJob.atsType = enriched.atsType;
            atsJob.atsIdentifier = enriched.atsIdentifier;
            sourceJobs.push(enrichDiscoveryJob(applyAtsDetection(atsJob)));
          }
        }

        return {
          sourceName,
          success: true,
          jobs: sourceJobs,
          expandedCompanies: sourceExpandedCompanies,
        };
      } catch (error) {
        logger?.({
          event: "discovery_source_error",
          source: sourceName,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          sourceName,
          success: false,
          jobs: [],
          expandedCompanies: [],
        };
      }
    },
  );

  for (const result of sourceResults) {
    if (result.success) {
      successfulSources.push(result.sourceName);
      expandedCompanies.push(...result.expandedCompanies);
      const batchJobs: DiscoveryJob[] = [];
      for (const job of result.jobs) {
        if (!pushJob(jobs, seenJobs, job)) continue;

        // Cross-platform dedup: same company+title from different sources
        const xKey = crossPlatformDedupKey(job);
        const existingIdx = crossPlatformSeen.get(xKey);
        if (existingIdx !== undefined) {
          // Keep the version with richer data
          const existing = jobs[existingIdx];
          if (jobRichness(job) > jobRichness(existing)) {
            jobs[existingIdx] = job;
            // Replace in batch if the existing was in current batch
            const batchIdx = batchJobs.indexOf(existing);
            if (batchIdx !== -1) batchJobs[batchIdx] = job;
          }
          // Pop the duplicate we just pushed
          jobs.pop();
          continue;
        }
        crossPlatformSeen.set(xKey, jobs.length - 1);
        batchJobs.push(job);
      }
      if (batchJobs.length > 0) {
        dependencies.onJobsBatch?.(batchJobs, result.sourceName);
      }
    } else {
      failedSources.push(result.sourceName);
    }
  }

  const dedupedCount = Array.from(crossPlatformSeen.values()).length;
  const totalBeforeDedup = sourceResults.reduce(
    (sum, r) => sum + (r.success ? r.jobs.length : 0),
    0,
  );
  logger?.({
    event: "discovery_run_complete",
    successfulSources,
    failedSources,
    totalJobs: jobs.length,
    expandedCompanies,
    crossPlatformDuplicatesRemoved: totalBeforeDedup - jobs.length,
  });
  return {
    jobs,
    sources: successfulSources,
    failedSources,
    expandedCompanies,
  };
}

interface SourceRunResult {
  sourceName: DiscoverySourceName;
  success: boolean;
  jobs: DiscoveryJob[];
  expandedCompanies: string[];
}

function createDefaultSourceFactories(
  httpClient: HttpClient,
): Partial<Record<DiscoverySourceName, () => DiscoverySourceRunner>> {
  return {
    linkedin: () => new LinkedInGuestSource(httpClient),
    seek: () => new SeekBrowserSource(),
    indeed: () => new IndeedBrowserSource(),
    jora: () => new JoraBrowserSource(),
  };
}

function createDefaultAtsCrawlerFactories(
  httpClient: HttpClient,
): Partial<Record<AtsProviderName, () => AtsCrawlerRunner>> {
  return {
    greenhouse: () => new GreenhouseCrawler(httpClient),
    lever: () => new LeverCrawler(httpClient),
  };
}

async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function applyAtsDetection(job: DiscoveryJob): DiscoveryJob {
  const detection = detectAts(job.externalUrl || null, {
    easyApply: job.atsType === "linkedin_easy_apply",
  });
  if (detection.applyUrl) {
    job.externalUrl = detection.applyUrl;
  }
  if (detection.atsType !== "unknown") {
    job.atsType = detection.atsType;
  }
  if (detection.companyIdentifier) {
    job.atsIdentifier = detection.companyIdentifier;
  }
  return job;
}

function pushJob(
  jobs: DiscoveryJob[],
  seenJobs: Set<string>,
  job: DiscoveryJob,
): boolean {
  const key = `${job.source}:${job.id || job.jobUrl || job.externalUrl}`;
  if (seenJobs.has(key)) {
    return false;
  }
  seenJobs.add(key);
  jobs.push(job);
  return true;
}

function isSupportedAts(atsType: DiscoveryJob["atsType"]): atsType is AtsProviderName {
  return atsType === "greenhouse" || atsType === "lever";
}

async function maybeApplyCareerDiscovery(
  job: DiscoveryJob,
  options: DiscoveryRunOptions,
  careerDiscoverer: CompanyCareerDiscovererLike | null,
  cache: Map<string, unknown>,
  logger?: (payload: Record<string, unknown>) => void,
): Promise<DiscoveryJob> {
  if (
    !careerDiscoverer ||
    !shouldRunCareerDiscovery({
      enabled: !!options.careerDiscovery,
      onlyUnknown: !!options.careerDiscoveryOnlyUnknown,
      applyUrl: job.externalUrl || null,
      atsType: job.atsType,
    })
  ) {
    return job;
  }

  try {
    const result = (await getCachedCareerDiscoveryResult({
      cache,
      companyName: job.company,
      location: [job.location, options.location].filter(Boolean).join(" "),
      atsType: job.atsType,
      careerDiscoverer,
      logger,
    })) as {
      applyUrl?: string | null;
    };
    if (result.applyUrl) {
      job.externalUrl = result.applyUrl;
      return applyAtsDetection(job);
    }
  } catch (error) {
    logger?.({
      event: "career_discovery_result",
      company: job.company,
      inferredDomain: null,
      probedUrls: [],
      atsType: job.atsType,
      outcome: "probe_error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return job;
}
