import type { HttpClient } from "../utils/http.js";
import { createEmptyDiscoveryJob, type DiscoveryJob } from "../core/types.js";

const GREENHOUSE_JOBS_URL = "https://boards-api.greenhouse.io/v1/boards/{company}/jobs";

interface GreenhouseJobItem {
  id?: string | number;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  created_at?: string;
  content?: string;
  location?: { name?: string };
  metadata?: Array<{ name?: string; value?: string }>;
}

interface GreenhousePayload {
  jobs?: GreenhouseJobItem[];
}

export class GreenhouseCrawler {
  readonly atsType = "greenhouse";

  constructor(private readonly httpClient: HttpClient) {}

  async crawlJobs(
    companyIdentifier: string,
    extractedAt: string,
  ): Promise<DiscoveryJob[]> {
    const url = GREENHOUSE_JOBS_URL.replace("{company}", companyIdentifier);
    const payload = await this.httpClient.getJson<GreenhousePayload>(url, {
      params: { content: "true" },
    });
    return normalizeGreenhouseJobs(payload, companyIdentifier, extractedAt);
  }
}

export function normalizeGreenhouseJobs(
  payload: GreenhousePayload,
  companyIdentifier: string,
  extractedAt: string,
): DiscoveryJob[] {
  return (payload.jobs ?? []).map((item) => {
    const job = createEmptyDiscoveryJob({
      id: String(item.id || item.absolute_url || item.title || ""),
      source: "linkedin",
      title: item.title || "",
      company: companyIdentifier,
      location: item.location?.name || "",
      description: htmlToText(item.content || ""),
      jobUrl: item.absolute_url || "",
      extractedAt,
      postedAt: item.updated_at || item.created_at || null,
    });

    job.source = "greenhouse";
    job.externalUrl = item.absolute_url || "";
    job.atsType = "greenhouse";
    job.salary = extractMetadataValue(item.metadata, ["salary", "compensation", "pay"]);
    job.jobType = extractMetadataValue(item.metadata, [
      "employment type",
      "job type",
      "commitment",
      "schedule",
    ]);
    return job;
  });
}

function htmlToText(content: string): string {
  if (!content) {
    return "";
  }

  return normalizeWhitespace(
    decodeHtmlEntities(
      content
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|ul|ol|section|article|h\d)>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function extractMetadataValue(
  metadata: GreenhouseJobItem["metadata"],
  targetNames: string[],
): string {
  if (!Array.isArray(metadata)) {
    return "";
  }

  const normalizedTargets = new Set(targetNames.map((name) => name.toLowerCase()));
  for (const item of metadata) {
    const name = String(item?.name || "").trim().toLowerCase();
    if (!normalizedTargets.has(name)) {
      continue;
    }
    const value = String(item?.value || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
