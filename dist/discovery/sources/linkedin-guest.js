import { DOMAIN_MAP, extractKnownAtsUrls, normalizeAtsUrlCandidate, unwrapLinkedInRedirect, } from "../ats/detector.js";
import { detectAts } from "../ats/detector.js";
import { createEmptyDiscoveryJob } from "../core/types.js";
const JOB_URN_PATTERN = /urn:li:jobPosting:(\d+)/i;
const LINKEDIN_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const LINKEDIN_JOB_DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{jobId}";
export class LinkedInGuestSource {
    httpClient;
    name = "linkedin";
    constructor(httpClient) {
        this.httpClient = httpClient;
    }
    async discoverJobs(request) {
        const jobs = [];
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
            request.onProgress?.({
                page: pageIndex + 1,
                totalPages: request.pages,
                jobsFound: jobs.length + cards.length,
            });
            for (const card of cards) {
                try {
                    const detailHtml = await this.httpClient.getText(LINKEDIN_JOB_DETAIL_URL.replace("{jobId}", card.jobId));
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
                    job.salary = detail.salary;
                    job.applicantCount = detail.applicantCount;
                    job.companyLogoUrl = detail.companyLogoUrl || card.companyLogoUrl;
                    jobs.push(job);
                }
                catch {
                    jobs.push(createEmptyDiscoveryJob({
                        id: card.jobId,
                        source: "linkedin",
                        title: card.title,
                        company: card.company,
                        location: card.location,
                        description: "",
                        jobUrl: card.jobUrl,
                        postedAt: card.postedAt,
                        extractedAt: request.extractedAt,
                    }));
                }
            }
        }
        return jobs;
    }
}
export function parseLinkedInGuestSearchResults(html) {
    const indices = [...html.matchAll(/data-entity-urn=(['"])(urn:li:jobPosting:\d+)\1/gi)]
        .map((match) => ({
        index: match.index ?? 0,
        urn: match[2],
    }))
        .filter((entry) => JOB_URN_PATTERN.test(entry.urn));
    const results = [];
    const seen = new Set();
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
            jobUrl: toAbsoluteLinkedInUrl(extractFirstAttribute(chunk, [
                /<a[^>]*class=(['"])[^"']*base-card__full-link[^"']*\1[^>]*href=(['"])([^"']+)\2/i,
                /<a[^>]*class=(['"])[^"']*base-search-card__full-link[^"']*\1[^>]*href=(['"])([^"']+)\2/i,
                /<a[^>]*class=(['"])[^"']*hidden-nested-link[^"']*\1[^>]*href=(['"])([^"']+)\2/i,
                /<a[^>]*href=(['"])([^"']+)\1/i,
            ])),
            postedAt: extractTimeDate(chunk),
            companyLogoUrl: extractCompanyLogoUrl(chunk),
        });
        seen.add(jobId);
    }
    return results;
}
export function parseLinkedInGuestJobDetail(html, options) {
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
    const description = extractContainerTextByClass(html, [
        "show-more-less-html__markup",
        "description__text",
        "jobs-box__html-content",
        "jobs-description__content",
        "description",
    ], "\n");
    const salary = extractSalary(html);
    const { applyUrl, isEasyApply } = extractApplyState(html);
    const applicantCount = extractApplicantCount(html);
    const companyLogoUrl = extractCompanyLogoUrl(html);
    return {
        jobId: options.jobId,
        title,
        company,
        location,
        description,
        salary,
        applyUrl,
        isEasyApply,
        jobUrl: options.jobUrl ?? "",
        applicantCount,
        companyLogoUrl,
    };
}
function extractCompanyLogoUrl(html) {
    const patterns = [
        /<img[^>]*class=(['"])[^"']*artdeco-entity-image[^"']*\1[^>]*data-delayed-url=(['"])([^"']+)\2/i,
        /<img[^>]*data-delayed-url=(['"])([^"']+)\1[^>]*class=(['"])[^"']*artdeco-entity-image[^"']*\3/i,
        /<img[^>]*class=(['"])[^"']*artdeco-entity-image[^"']*\1[^>]*src=(['"])([^"']+)\2/i,
        /<img[^>]*class=(['"])[^"']*evi-image[^"']*\1[^>]*data-delayed-url=(['"])([^"']+)\2/i,
        /<img[^>]*class=(['"])[^"']*evi-image[^"']*\1[^>]*src=(['"])([^"']+)\2/i,
        /<img[^>]*class=(['"])[^"']*company-logo[^"']*\1[^>]*src=(['"])([^"']+)\2/i,
        /<img[^>]*class=(['"])[^"']*top-card-layout__entity-image[^"']*\1[^>]*data-delayed-url=(['"])([^"']+)\2/i,
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (!match)
            continue;
        const url = (match.at(-1) ?? "").trim();
        if (url && !url.includes("data:image")) {
            return url;
        }
    }
    return "";
}
function extractApplyState(html) {
    for (const attributeName of ["data-apply-url", "data-applyurl"]) {
        const attributePattern = new RegExp(`${attributeName}=(['"])([^"']+)\\1`, "i");
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
function normalizeApplyAnchor(attributes, text) {
    const href = attributes.href?.trim();
    if (!href) {
        return null;
    }
    let candidate;
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
        if (normalizedText.includes("apply") ||
            classText.includes("apply") ||
            tracking.includes("apply")) {
            return candidate;
        }
        for (const domain of Object.keys(DOMAIN_MAP)) {
            if (hostname === domain || hostname.endsWith(`.${domain}`)) {
                return candidate;
            }
        }
    }
    catch {
        return null;
    }
    return null;
}
function hasEasyApplyMarker(html) {
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
function extractApplicantCount(html) {
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
function extractSalary(html) {
    const candidateClassNames = [
        "job-details-preferences-and-skills__pill",
        "job-details-jobs-unified-top-card__job-insight",
        "jobs-unified-top-card__salary-info",
        "compensation__salary-range",
    ];
    for (const className of candidateClassNames) {
        for (const text of extractContainerTextsByClass(html, className)) {
            const normalized = text.replace(/See how you compare.*/i, "").trim();
            if (looksLikeSalary(normalized)) {
                return normalized;
            }
        }
    }
    return "";
}
function extractAnchors(html) {
    const anchors = [];
    const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchorPattern)) {
        anchors.push({
            attributes: parseAttributes(match[1] ?? ""),
            text: stripTags(match[2] ?? ""),
        });
    }
    return anchors;
}
function parseAttributes(attributeText) {
    const attributes = {};
    const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of attributeText.matchAll(attributePattern)) {
        attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
    }
    return attributes;
}
function extractFirstText(html, patterns, separator = " ") {
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
function extractContainerTextByClass(html, classNames, separator = " ") {
    let bestCandidate = "";
    for (const className of classNames) {
        for (const text of extractContainerTextsByClass(html, className, separator)) {
            if (!text) {
                continue;
            }
            if (!bestCandidate) {
                bestCandidate = text;
            }
            if (!looksLikeThinHeading(text)) {
                return text;
            }
        }
    }
    return bestCandidate;
}
function extractContainerTextsByClass(html, className, separator = " ") {
    const texts = [];
    const pattern = new RegExp(`<([a-z0-9]+)\\b[^>]*class=(['"])[^"']*${escapeRegExp(className)}[^"']*\\2[^>]*>`, "gi");
    for (const match of html.matchAll(pattern)) {
        const tagName = (match[1] ?? "").toLowerCase();
        const startIndex = (match.index ?? 0) + match[0].length;
        const innerHtml = extractBalancedInnerHtml(html, startIndex, tagName);
        if (innerHtml === null) {
            continue;
        }
        const normalized = normalizeWhitespace(stripTags(decodeHtmlEntities(innerHtml), separator));
        if (normalized) {
            texts.push(normalized);
        }
    }
    return texts;
}
function extractBalancedInnerHtml(html, startIndex, tagName) {
    const tagPattern = /<\/?([a-z0-9]+)\b[^>]*>/gi;
    let depth = 1;
    for (const match of html.slice(startIndex).matchAll(tagPattern)) {
        const fullMatch = match[0] ?? "";
        const matchedTag = (match[1] ?? "").toLowerCase();
        if (matchedTag !== tagName) {
            continue;
        }
        const relativeIndex = match.index ?? 0;
        const absoluteIndex = startIndex + relativeIndex;
        const isClosingTag = fullMatch.startsWith("</");
        const isSelfClosingTag = /\/>$/.test(fullMatch);
        if (isClosingTag) {
            depth -= 1;
            if (depth === 0) {
                return html.slice(startIndex, absoluteIndex);
            }
            continue;
        }
        if (!isSelfClosingTag) {
            depth += 1;
        }
    }
    return null;
}
function extractFirstAttribute(html, patterns) {
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
function extractTimeDate(html) {
    const match = html.match(/<time[^>]*datetime=(['"])([^"']+)\1/i);
    return match?.[2]?.trim() || null;
}
function stripTags(html, separator = " ") {
    return html.replace(/<br\s*\/?>/gi, separator).replace(/<[^>]+>/g, separator);
}
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function looksLikeThinHeading(value) {
    return value.length <= 32 && !/[.!?]/.test(value);
}
function looksLikeSalary(value) {
    return /[$€£¥₹]|salary|compensation|pay|package|\/yr|\/hour|\/month|\/week|\bper\s+(year|annum|hour|month|week|day)\b|\d+\s*[kK]\b/i.test(value);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
function toAbsoluteLinkedInUrl(value) {
    if (!value) {
        return "";
    }
    if (/^https?:\/\//i.test(value)) {
        return value;
    }
    return new URL(value, "https://www.linkedin.com").toString();
}
