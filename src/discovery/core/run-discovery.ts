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
}

export async function runDiscovery(
  options: DiscoveryRunOptions,
  dependencies: RunDiscoveryDependencies = {},
): Promise<DiscoveryRunResult> {
  const selectedSources = options.sources ?? getActiveDiscoverySourceNames();
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

  for (const sourceName of selectedSources) {
    const factory = sourceFactories[sourceName];
    if (!factory) {
      failedSources.push(sourceName);
      continue;
    }

    try {
      const source = factory();
      const discoveredJobs = await source.discoverJobs({
        keyword: options.keyword,
        location: options.location,
        pages: options.pages ?? 30,
        extractedAt: extractedAtFactory(),
      });
      successfulSources.push(sourceName);

      for (const job of discoveredJobs) {
        const enriched = enrichDiscoveryJob(
          await maybeApplyCareerDiscovery(
            applyAtsDetection(job),
            options,
            careerDiscoverer,
            careerDiscoveryCache,
            dependencies.logger,
          ),
        );
        pushJob(jobs, seenJobs, enriched);

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
        expandedCompanies.push(companyKey);
        const atsJobs = await crawlerFactory().crawlJobs(
          enriched.atsIdentifier,
          extractedAtFactory(),
        );
        for (const atsJob of atsJobs) {
          pushJob(jobs, seenJobs, enrichDiscoveryJob(applyAtsDetection(atsJob)));
        }
      }
    } catch {
      failedSources.push(sourceName);
    }
  }

  return {
    jobs,
    sources: successfulSources,
    failedSources,
    expandedCompanies,
  };
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
): void {
  const key = `${job.source}:${job.id || job.jobUrl || job.externalUrl}`;
  if (seenJobs.has(key)) {
    return;
  }
  seenJobs.add(key);
  jobs.push(job);
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
      location: job.location,
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
