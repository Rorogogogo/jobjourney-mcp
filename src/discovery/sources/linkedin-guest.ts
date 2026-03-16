import {
  DOMAIN_MAP,
  extractKnownAtsUrls,
  normalizeAtsUrlCandidate,
  unwrapLinkedInRedirect,
} from "../ats/detector.js";
import { detectAts } from "../ats/detector.js";
import { createEmptyDiscoveryJob, type DiscoveryJob } from "../core/types.js";
import type { DiscoverSourceRequest, DiscoverySourceRunner } from "./base.js";
import type { HttpClient } from "../utils/http.js";

const JOB_URN_PATTERN = /urn:li:jobPosting:(\d+)/i;
const LINKEDIN_SEARCH_URL =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const LINKEDIN_JOB_DETAIL_URL =
  "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{jobId}";

export interface LinkedInGuestSearchCard {
  jobId: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  postedAt: string | null;
}

export interface LinkedInGuestJobDetail {
  jobId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string | null;
  isEasyApply: boolean;
  jobUrl: string;
  applicantCount: string;
}

export class LinkedInGuestSource implements DiscoverySourceRunner {
  readonly name = "linkedin" as const;

  constructor(private readonly httpClient: HttpClient) {}

  async discoverJobs(request: DiscoverSourceRequest): Promise<DiscoveryJob[]> {
    const jobs: DiscoveryJob[] = [];

    for (let pageIndex = 0; pageIndex < request.pages; pageIndex += 1) {
      const html = await this.httpClient.getText(LINKEDIN_SEARCH_URL, {
        params: {
          keywords: request.keyword,
          location: request.location,
          start: String(pageIndex * 25),
        },
      });
      const cards = parseLinkedInGuestSearchResults(html);
      if (cards.length === 0) {
        break;
      }

      for (const card of cards) {
        try {
          const detailHtml = await this.httpClient.getText(
            LINKEDIN_JOB_DETAIL_URL.replace("{jobId}", card.jobId),
          );
          const detail = parseLinkedInGuestJobDetail(detailHtml, {
            jobId: card.jobId,
            jobUrl: card.jobUrl,
          });
          const detection = detectAts(detail.applyUrl, {
            easyApply: detail.isEasyApply,
          });

          const job = createEmptyDiscoveryJob({
            id: detail.jobId,
            source: "linkedin",
            title: detail.title || card.title,
            company: detail.company || card.company,
            location: detail.location || card.location,
            description: detail.description,
            jobUrl: detail.jobUrl || card.jobUrl,
            postedAt: card.postedAt,
            extractedAt: request.extractedAt,
          });
          job.externalUrl = detection.applyUrl || "";
          job.atsType = detection.atsType;
          job.atsIdentifier = detection.companyIdentifier || "";
          job.applicantCount = detail.applicantCount;
          jobs.push(job);
        } catch {
          jobs.push(
            createEmptyDiscoveryJob({
              id: card.jobId,
              source: "linkedin",
              title: card.title,
              company: card.company,
              location: card.location,
              description: "",
              jobUrl: card.jobUrl,
              postedAt: card.postedAt,
              extractedAt: request.extractedAt,
            }),
          );
        }
      }
    }

    return jobs;
  }
}

export function parseLinkedInGuestSearchResults(
  html: string,
): LinkedInGuestSearchCard[] {
  const indices = [...html.matchAll(/data-entity-urn=(['"])(urn:li:jobPosting:\d+)\1/gi)]
    .map((match) => ({
      index: match.index ?? 0,
      urn: match[2],
    }))
    .filter((entry) => JOB_URN_PATTERN.test(entry.urn));

  const results: LinkedInGuestSearchCard[] = [];
  const seen = new Set<string>();

  for (let position = 0; position < indices.length; position += 1) {
    const current = indices[position];
    const nextIndex = indices[position + 1]?.index ?? html.length;
    const chunk = html.slice(current.index, nextIndex);
    const jobId = current.urn.match(JOB_URN_PATTERN)?.[1];
    if (!jobId || seen.has(jobId)) {
      continue;
    }

    results.push({
      jobId,
      title: extractFirstText(chunk, [
        /<h3[^>]*class=(['"])[^"']*base-search-card__title[^"']*\1[^>]*>([\s\S]*?)<\/h3>/i,
        /<h3[^>]*class=(['"])[^"']*base-card__title[^"']*\1[^>]*>([\s\S]*?)<\/h3>/i,
        /<h3[^>]*>([\s\S]*?)<\/h3>/i,
      ]),
      company: extractFirstText(chunk, [
        /<h4[^>]*class=(['"])[^"']*base-search-card__subtitle[^"']*\1[^>]*>[\s\S]*?<a[^>]*class=(['"])[^"']*hidden-nested-link[^"']*\2[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h4>/i,
        /<h4[^>]*class=(['"])[^"']*base-search-card__subtitle[^"']*\1[^>]*>([\s\S]*?)<\/h4>/i,
        /<a[^>]*class=(['"])[^"']*hidden-nested-link[^"']*\1[^>]*>([\s\S]*?)<\/a>/i,
      ]),
      location: extractFirstText(chunk, [
        /<span[^>]*class=(['"])[^"']*job-search-card__location[^"']*\1[^>]*>([\s\S]*?)<\/span>/i,
        /<div[^>]*class=(['"])[^"']*base-search-card__metadata[^"']*\1[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class=(['"])[^"']*base-card__metadata[^"']*\1[^>]*>([\s\S]*?)<\/div>/i,
      ]),
      jobUrl: toAbsoluteLinkedInUrl(
        extractFirstAttribute(chunk, [
          /<a[^>]*class=(['"])[^"']*base-card__full-link[^"']*\1[^>]*href=(['"])([^"']+)\2/i,
          /<a[^>]*class=(['"])[^"']*base-search-card__full-link[^"']*\1[^>]*href=(['"])([^"']+)\2/i,
          /<a[^>]*class=(['"])[^"']*hidden-nested-link[^"']*\1[^>]*href=(['"])([^"']+)\2/i,
          /<a[^>]*href=(['"])([^"']+)\1/i,
        ]),
      ),
      postedAt: extractTimeDate(chunk),
    });
    seen.add(jobId);
  }

  return results;
}

export function parseLinkedInGuestJobDetail(
  html: string,
  options: { jobId: string; jobUrl?: string },
): LinkedInGuestJobDetail {
  const title = extractFirstText(html, [
    /<[^>]*class=(['"])[^"']*top-card-layout__title[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class=(['"])[^"']*topcard__title[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
  ]);
  const company = extractFirstText(html, [
    /<a[^>]*class=(['"])[^"']*topcard__org-name-link[^"']*\1[^>]*>([\s\S]*?)<\/a>/i,
    /<[^>]*class=(['"])[^"']*topcard__flavor[^"']*\1[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/[^>]+>/i,
    /<[^>]*class=(['"])[^"']*topcard__flavor[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
  ]);
  const location = extractFirstText(html, [
    /<[^>]*class=(['"])[^"']*topcard__flavor--bullet[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class=(['"])[^"']*topcard__flavor--metadata[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class=(['"])[^"']*topcard__flavor[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
  ]);
  const description = extractFirstText(html, [
    /<[^>]*class=(['"])[^"']*show-more-less-html__markup[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class=(['"])[^"']*description__text[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class=(['"])[^"']*description[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i,
  ], "\n");
  const { applyUrl, isEasyApply } = extractApplyState(html);
  const applicantCount = extractApplicantCount(html);

  return {
    jobId: options.jobId,
    title,
    company,
    location,
    description,
    applyUrl,
    isEasyApply,
    jobUrl: options.jobUrl ?? "",
    applicantCount,
  };
}

function extractApplyState(html: string): {
  applyUrl: string | null;
  isEasyApply: boolean;
} {
  for (const attributeName of ["data-apply-url", "data-applyurl"]) {
    const attributePattern = new RegExp(
      `${attributeName}=(['"])([^"']+)\\1`,
      "i",
    );
    const match = html.match(attributePattern);
    const applyUrl = normalizeAtsUrlCandidate(match?.[2] ?? "");
    if (applyUrl) {
      return { applyUrl, isEasyApply: false };
    }
  }

  for (const anchor of extractAnchors(html)) {
    const applyUrl = normalizeApplyAnchor(anchor.attributes, anchor.text);
    if (applyUrl) {
      return { applyUrl, isEasyApply: false };
    }
  }

  const embeddedUrl = extractKnownAtsUrls(html)[0];
  if (embeddedUrl) {
    return { applyUrl: embeddedUrl, isEasyApply: false };
  }

  return { applyUrl: null, isEasyApply: hasEasyApplyMarker(html) };
}

function normalizeApplyAnchor(
  attributes: Record<string, string>,
  text: string,
): string | null {
  const href = attributes.href?.trim();
  if (!href) {
    return null;
  }

  let candidate: string;
  try {
    candidate = unwrapLinkedInRedirect(href);
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    if (hostname.endsWith("linkedin.com")) {
      return null;
    }

    const classText = attributes.class?.toLowerCase() ?? "";
    const normalizedText = normalizeWhitespace(text).toLowerCase();
    const tracking = [
      attributes["data-control-name"],
      attributes["data-tracking-control-name"],
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (
      normalizedText.includes("apply") ||
      classText.includes("apply") ||
      tracking.includes("apply")
    ) {
      return candidate;
    }

    for (const domain of Object.keys(DOMAIN_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function hasEasyApplyMarker(html: string): boolean {
  const tagPattern = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const attributes = parseAttributes(match[2] ?? "");
    const text = normalizeWhitespace(stripTags(match[3] ?? "")).toLowerCase();
    const trackingName = (attributes["data-tracking-control-name"] ?? "").toLowerCase();
    const dataModal = (attributes["data-modal"] ?? "").toLowerCase();

    if (text.includes("easy apply")) {
      return true;
    }
    if (trackingName.includes("apply-link-onsite") || trackingName.includes("onsite")) {
      return true;
    }
    if (dataModal.includes("easy-apply")) {
      return true;
    }
  }

  return false;
}

function extractApplicantCount(html: string): string {
  const candidates = [
    /<[^>]*class=(['"])[^"']*num-applicants__caption[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/gi,
    /<[^>]*class=(['"])[^"']*topcard__flavor--metadata[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/gi,
  ];

  for (const pattern of candidates) {
    for (const match of html.matchAll(pattern)) {
      const value = normalizeWhitespace(stripTags(match[2] ?? ""));
      if (value && value.toLowerCase().includes("applicant")) {
        return value;
      }
    }
  }

  return "";
}

function extractAnchors(html: string): Array<{
  attributes: Record<string, string>;
  text: string;
}> {
  const anchors: Array<{ attributes: Record<string, string>; text: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    anchors.push({
      attributes: parseAttributes(match[1] ?? ""),
      text: stripTags(match[2] ?? ""),
    });
  }

  return anchors;
}

function parseAttributes(attributeText: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of attributeText.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }

  return attributes;
}

function extractFirstText(
  html: string,
  patterns: RegExp[],
  separator = " ",
): string {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    const value = match.at(-1) ?? "";
    const normalized = normalizeWhitespace(stripTags(decodeHtmlEntities(value), separator));
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function extractFirstAttribute(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    const value = match.at(-1) ?? "";
    if (value) {
      return decodeHtmlEntities(value).trim();
    }
  }

  return "";
}

function extractTimeDate(html: string): string | null {
  const match = html.match(/<time[^>]*datetime=(['"])([^"']+)\1/i);
  return match?.[2]?.trim() || null;
}

function stripTags(html: string, separator = " "): string {
  return html.replace(/<br\s*\/?>/gi, separator).replace(/<[^>]+>/g, separator);
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

function toAbsoluteLinkedInUrl(value: string): string {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return new URL(value, "https://www.linkedin.com").toString();
}
