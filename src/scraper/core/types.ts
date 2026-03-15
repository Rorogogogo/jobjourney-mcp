export interface ScrapeRequest {
  keyword: string;
  location: string;
  source: string;
  maxPages?: number;
}

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description?: string;
  salary?: string;
  postedDate?: string;
  jobType?: string;
  workplaceType?: string;
  companyLogoUrl?: string;
  applicantCount?: string;
  isAlreadyApplied?: boolean;
  appliedDateUtc?: string;
  scrapedAt: string;
}

export interface ScrapeResult {
  jobs: ScrapedJob[];
  markdown: string;
  runId: number;
}

export interface JobSourceScraper {
  scrape(request: ScrapeRequest): Promise<ScrapedJob[]>;
}
