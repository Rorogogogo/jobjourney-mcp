import { analyzeJobDescription } from "./description-analysis.js";
const CURRENCY_PATTERN = String.raw `(?:AUD|USD|EUR|GBP|CAD|NZD|\$|£|€)`;
const AMOUNT_PATTERN = String.raw `\d[\d,]*(?:\.\d+)?(?:\s*[kKmMbB])?`;
const SALARY_PERIOD_PATTERN = String.raw `(?:year|annum|annual|hour|hr|day|daily|week|weekly|month|monthly)`;
const SALARY_RANGE_PATTERN = new RegExp(String.raw `(?<currency>${CURRENCY_PATTERN})\s*(?<minimum>${AMOUNT_PATTERN})\s*` +
    String.raw `(?:-|–|to)\s*(?:(?<maximumCurrency>${CURRENCY_PATTERN})\s*)?` +
    String.raw `(?<maximum>${AMOUNT_PATTERN})`, "i");
const SALARY_SINGLE_PATTERN = new RegExp(String.raw `(?<currency>${CURRENCY_PATTERN})\s*(?<amount>${AMOUNT_PATTERN})`, "i");
const SALARY_DESCRIPTION_PATTERNS = [
    [
        new RegExp(String.raw `${CURRENCY_PATTERN}\s*${AMOUNT_PATTERN}\s*(?:-|–|to)\s*(?:${CURRENCY_PATTERN}\s*)?${AMOUNT_PATTERN}` +
            String.raw `(?:\s*(?:per|/)\s*${SALARY_PERIOD_PATTERN})?`, "i"),
        0,
    ],
    [
        new RegExp(String.raw `(?:salary|compensation|base(?:\s+salary)?|ote|pay|package|remuneration|rate)` +
            String.raw `[^\n]{0,20}?(?<salary>${CURRENCY_PATTERN}\s*${AMOUNT_PATTERN}` +
            String.raw `(?:\s*(?:-|–|to)\s*(?:${CURRENCY_PATTERN}\s*)?${AMOUNT_PATTERN})?` +
            String.raw `(?:\s*(?:per|/)\s*${SALARY_PERIOD_PATTERN})?)`, "i"),
        "salary",
    ],
];
const APPLICANT_COUNT_PATTERNS = [
    /\b(\d+\+?\s+applicants?)\b/i,
    /\b(over\s+\d+\s+applicants?)\b/i,
    /\b(\d+\+?\s+people clicked apply)\b/i,
];
export function enrichDiscoveryJob(job) {
    // Normalize relative posted dates (e.g. "3d ago") to ISO strings
    if (job.postedAt && !isIsoDate(job.postedAt)) {
        job.postedAt = normalizePostedDate(job.postedAt);
    }
    const analysis = analyzeJobDescription(job.description || "");
    const salarySource = job.salaryRaw || job.salary || extractSalary(job.description || "") || "";
    const salary = normalizeSalary(salarySource);
    job.salary = salary.raw || job.salaryRaw || job.salary;
    job.salaryRaw = salary.raw || job.salaryRaw;
    job.salaryMin = salary.minimum || job.salaryMin;
    job.salaryMax = salary.maximum || job.salaryMax;
    job.salaryCurrency = salary.currency || job.salaryCurrency;
    job.salaryPeriod = coalesceSalaryPeriod(salary.period, job.salaryPeriod);
    if (!job.jobType && analysis.employmentType.type !== "unknown") {
        job.jobType = analysis.employmentType.type;
    }
    if (!job.workArrangement && analysis.workArrangement.type !== "unknown") {
        job.workArrangement = analysis.workArrangement.type;
    }
    if (!job.applicantCount) {
        job.applicantCount = extractApplicantCount(job.description || "") || "";
    }
    job.techStack = JSON.stringify(analysis.techStack.technologies);
    if (!job.requiredSkills) {
        job.requiredSkills = analysis.techStack.technologies.join(", ");
    }
    if (!job.experienceLevel && analysis.experienceLevel.level !== "unknown") {
        job.experienceLevel = analysis.experienceLevel.level;
    }
    job.experienceYears = analysis.experienceLevel.years;
    job.isPrRequired = analysis.prDetection.isPrRequired;
    job.securityClearance = analysis.prDetection.securityClearance || "";
    job.prConfidence = analysis.prDetection.confidence;
    job.prReasoning = analysis.prDetection.reasoning;
    return job;
}
export function normalizeSalary(text) {
    const cleaned = cleanText(text);
    if (!cleaned) {
        return emptySalary();
    }
    const salaryRangeMatch = SALARY_RANGE_PATTERN.exec(cleaned);
    if (salaryRangeMatch?.groups) {
        return {
            raw: cleaned,
            minimum: normalizeAmount(salaryRangeMatch.groups.minimum),
            maximum: normalizeAmount(salaryRangeMatch.groups.maximum),
            currency: normalizeCurrency(salaryRangeMatch.groups.currency, salaryRangeMatch.groups.maximumCurrency),
            period: detectSalaryPeriod(cleaned),
        };
    }
    const salarySingleMatch = SALARY_SINGLE_PATTERN.exec(cleaned);
    if (salarySingleMatch?.groups) {
        const amount = normalizeAmount(salarySingleMatch.groups.amount);
        return {
            raw: cleaned,
            minimum: amount,
            maximum: amount,
            currency: normalizeCurrency(salarySingleMatch.groups.currency),
            period: detectSalaryPeriod(cleaned),
        };
    }
    return {
        raw: cleaned,
        minimum: null,
        maximum: null,
        currency: "",
        period: "",
    };
}
export function extractSalary(text) {
    const cleaned = cleanText(text);
    for (const [pattern, group] of SALARY_DESCRIPTION_PATTERNS) {
        const match = pattern.exec(cleaned);
        if (!match) {
            continue;
        }
        const value = typeof group === "number"
            ? match[group] ?? ""
            : match.groups?.[group] ?? "";
        return normalizeWhitespace(value);
    }
    return null;
}
export function extractApplicantCount(text) {
    const cleaned = cleanText(text);
    for (const pattern of APPLICANT_COUNT_PATTERNS) {
        const match = pattern.exec(cleaned);
        if (match?.[1]) {
            return normalizeWhitespace(match[1]);
        }
    }
    return null;
}
function emptySalary() {
    return {
        raw: "",
        minimum: null,
        maximum: null,
        currency: "",
        period: "",
    };
}
function cleanText(text) {
    if (!text) {
        return "";
    }
    return normalizeWhitespace(decodeHtmlEntities(text
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|ul|ol|section|article|h\d)>/gi, " ")
        .replace(/<[^>]+>/g, " ")));
}
function normalizeAmount(amount) {
    if (!amount) {
        return null;
    }
    let normalized = amount.replace(/,/g, "").replace(/\s+/g, "");
    let multiplier = 1;
    const suffix = normalized.at(-1)?.toLowerCase() ?? "";
    if (suffix === "k") {
        multiplier = 1_000;
        normalized = normalized.slice(0, -1);
    }
    else if (suffix === "m") {
        multiplier = 1_000_000;
        normalized = normalized.slice(0, -1);
    }
    else if (suffix === "b") {
        multiplier = 1_000_000_000;
        normalized = normalized.slice(0, -1);
    }
    const value = Number.parseFloat(normalized);
    if (Number.isNaN(value)) {
        return normalized;
    }
    const scaled = value * multiplier;
    return Number.isInteger(scaled) ? String(scaled) : String(scaled);
}
function normalizeCurrency(...currencies) {
    for (const currency of currencies) {
        if (currency) {
            return /^[A-Za-z]+$/.test(currency) ? currency.toUpperCase() : currency;
        }
    }
    return "";
}
function detectSalaryPeriod(text) {
    const periodPatterns = [
        ["hour", /(?:\/|\bper\b)\s*(?:hour|hr)\b|\bhourly\b/i],
        ["day", /(?:\/|\bper\b)\s*day\b|\bdaily\b/i],
        ["week", /(?:\/|\bper\b)\s*week\b|\bweekly\b/i],
        ["month", /(?:\/|\bper\b)\s*month\b|\bmonthly\b/i],
        ["year", /(?:\/|\bper\b)\s*(?:year|annum)\b|\bannual(?:ly)?\b|\bp\.?\s*a\.?\b/i],
    ];
    for (const [period, pattern] of periodPatterns) {
        if (pattern.test(text)) {
            return period;
        }
    }
    return "unknown";
}
function coalesceSalaryPeriod(parsedPeriod, existingPeriod) {
    if (parsedPeriod && parsedPeriod !== "unknown") {
        return parsedPeriod;
    }
    if (existingPeriod) {
        return existingPeriod;
    }
    return parsedPeriod;
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
// ---------------------------------------------------------------------------
// Posted-date normalization
// ---------------------------------------------------------------------------
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function isIsoDate(value) {
    return ISO_DATE_RE.test(value);
}
/**
 * Convert a relative date string (e.g. "3d ago", "Posted 2w ago", "30+ days ago",
 * "2 weeks ago", "1 month ago", "yesterday") into an ISO date string.
 * Returns null if the string can't be parsed.
 */
export function normalizePostedDate(raw) {
    const s = raw.toLowerCase().trim();
    const now = new Date();
    if (s.includes("today") || s === "just posted" || s === "just now") {
        return toIsoDate(now);
    }
    if (s.includes("yesterday")) {
        now.setDate(now.getDate() - 1);
        return toIsoDate(now);
    }
    // "3d ago", "3 days ago", "30+ days ago", "Posted 3d ago"
    const daysMatch = s.match(/(\d+)\+?\s*d(?:ays?)?\s*ago/);
    if (daysMatch) {
        now.setDate(now.getDate() - parseInt(daysMatch[1], 10));
        return toIsoDate(now);
    }
    // "2w ago", "2 weeks ago", "Posted 1w ago"
    const weeksMatch = s.match(/(\d+)\+?\s*w(?:eeks?)?\s*ago/);
    if (weeksMatch) {
        now.setDate(now.getDate() - parseInt(weeksMatch[1], 10) * 7);
        return toIsoDate(now);
    }
    // "1 month ago", "2m ago", "3 months ago", "Posted 1mo ago"
    const monthsMatch = s.match(/(\d+)\+?\s*(?:mo(?:nths?)?|m)\s*ago/);
    if (monthsMatch) {
        now.setMonth(now.getMonth() - parseInt(monthsMatch[1], 10));
        return toIsoDate(now);
    }
    // "1 year ago", "2y ago"
    const yearsMatch = s.match(/(\d+)\+?\s*y(?:ears?)?\s*ago/);
    if (yearsMatch) {
        now.setFullYear(now.getFullYear() - parseInt(yearsMatch[1], 10));
        return toIsoDate(now);
    }
    // "1 hour ago", "3 hours ago", "2h ago"
    const hoursMatch = s.match(/(\d+)\+?\s*h(?:ours?)?\s*ago/);
    if (hoursMatch) {
        now.setHours(now.getHours() - parseInt(hoursMatch[1], 10));
        return toIsoDate(now);
    }
    // "5 minutes ago", "10min ago"
    const minutesMatch = s.match(/(\d+)\+?\s*min(?:utes?)?\s*ago/);
    if (minutesMatch) {
        return toIsoDate(now); // same day
    }
    // "Reposted 3d ago"
    const repostedMatch = s.match(/reposted\s+(\d+)\+?\s*d(?:ays?)?\s*ago/);
    if (repostedMatch) {
        now.setDate(now.getDate() - parseInt(repostedMatch[1], 10));
        return toIsoDate(now);
    }
    // If it already looks like a parseable date string, try Date.parse
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
        return toIsoDate(new Date(parsed));
    }
    return null;
}
function toIsoDate(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
