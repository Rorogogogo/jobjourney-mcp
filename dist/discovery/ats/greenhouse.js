import { createEmptyDiscoveryJob } from "../core/types.js";
const GREENHOUSE_JOBS_URL = "https://boards-api.greenhouse.io/v1/boards/{company}/jobs";
export class GreenhouseCrawler {
    httpClient;
    atsType = "greenhouse";
    constructor(httpClient) {
        this.httpClient = httpClient;
    }
    async crawlJobs(companyIdentifier, extractedAt) {
        const url = GREENHOUSE_JOBS_URL.replace("{company}", companyIdentifier);
        const payload = await this.httpClient.getJson(url, {
            params: { content: "true" },
        });
        return normalizeGreenhouseJobs(payload, companyIdentifier, extractedAt);
    }
}
export function normalizeGreenhouseJobs(payload, companyIdentifier, extractedAt) {
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
function htmlToText(content) {
    if (!content) {
        return "";
    }
    return normalizeWhitespace(decodeHtmlEntities(content
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|ul|ol|section|article|h\d)>/gi, " ")
        .replace(/<[^>]+>/g, " ")));
}
function extractMetadataValue(metadata, targetNames) {
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
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
