import { createEmptyDiscoveryJob } from "../core/types.js";
const LEVER_JOBS_URL = "https://api.lever.co/v0/postings/{company}";
export class LeverCrawler {
    httpClient;
    atsType = "lever";
    constructor(httpClient) {
        this.httpClient = httpClient;
    }
    async crawlJobs(companyIdentifier, extractedAt) {
        const url = LEVER_JOBS_URL.replace("{company}", companyIdentifier);
        const payload = await this.httpClient.getJson(url);
        return normalizeLeverJobs(payload, companyIdentifier, extractedAt);
    }
}
export function normalizeLeverJobs(payload, companyIdentifier, extractedAt) {
    return payload.map((item) => {
        const jobUrl = item.hostedUrl || item.applyUrl || "";
        const salaryRange = parseSalaryRange(item.salaryRange);
        const salaryText = firstNonEmptyString(item.salaryDescription, item.compensation, salaryRangeDisplay(item.salaryRange)) || "";
        const job = createEmptyDiscoveryJob({
            id: String(item.id || item.hostedUrl || item.text || ""),
            source: "linkedin",
            title: item.text || "",
            company: companyIdentifier,
            location: item.categories?.location || "",
            description: normalizeDescription(item),
            jobUrl,
            extractedAt,
            postedAt: normalizeCreatedAt(item.createdAt),
        });
        job.source = "lever";
        job.externalUrl = jobUrl;
        job.atsType = "lever";
        job.salary = salaryText;
        job.salaryRaw = salaryText;
        job.salaryMin = salaryRange.minimum || "";
        job.salaryMax = salaryRange.maximum || "";
        job.salaryCurrency = salaryRange.currency;
        job.salaryPeriod = salaryRange.period;
        job.jobType = item.categories?.commitment || "";
        return job;
    });
}
function normalizeDescription(item) {
    if (item.descriptionPlain) {
        return item.descriptionPlain;
    }
    if (!item.description) {
        return "";
    }
    return normalizeWhitespace(item.description
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|ul|ol|section|article|h\d)>/gi, " ")
        .replace(/<[^>]+>/g, " "));
}
function normalizeCreatedAt(value) {
    if (typeof value === "number") {
        const timestamp = value > 10_000_000_000 ? value / 1000 : value;
        return new Date(timestamp * 1000).toISOString().replace(".000Z", "+00:00");
    }
    if (typeof value === "string") {
        return value;
    }
    return null;
}
function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
function parseSalaryRange(value) {
    if (!value) {
        return { minimum: null, maximum: null, currency: "", period: "" };
    }
    return {
        minimum: normalizeSalaryBound(value.min),
        maximum: normalizeSalaryBound(value.max),
        currency: typeof value.currency === "string" ? value.currency.trim().toUpperCase() : "",
        period: normalizeSalaryPeriod(value.interval),
    };
}
function normalizeSalaryBound(value) {
    if (typeof value !== "number") {
        return null;
    }
    return Number.isInteger(value) ? String(value) : String(value);
}
function normalizeSalaryPeriod(value) {
    const mapping = {
        "per-hour-salary": "hour",
        "per-day-salary": "day",
        "per-week-salary": "week",
        "per-month-salary": "month",
        "per-year-salary": "year",
    };
    return value ? mapping[value.trim().toLowerCase()] || "" : "";
}
function salaryRangeDisplay(value) {
    const salaryRange = parseSalaryRange(value);
    const formattedMinimum = formatSalaryBound(salaryRange.minimum, salaryRange.currency);
    const formattedMaximum = formatSalaryBound(salaryRange.maximum, salaryRange.currency);
    if (!formattedMinimum && !formattedMaximum) {
        return "";
    }
    const rangeText = formattedMinimum && formattedMaximum && formattedMinimum !== formattedMaximum
        ? `${formattedMinimum} - ${formattedMaximum}`
        : formattedMinimum || formattedMaximum;
    return salaryRange.period ? `${rangeText} per ${salaryRange.period}` : rangeText;
}
function formatSalaryBound(value, currency) {
    if (!value) {
        return "";
    }
    const numeric = Number.parseFloat(value);
    const amount = Number.isNaN(numeric)
        ? value
        : Number.isInteger(numeric)
            ? numeric.toLocaleString("en-US")
            : numeric.toLocaleString("en-US");
    return `${currency ? `${currency} ` : ""}${amount}`.trim();
}
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
