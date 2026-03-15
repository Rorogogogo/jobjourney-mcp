const DOMAIN_MAP = {
    "boards.greenhouse.io": "greenhouse",
    "jobs.lever.co": "lever",
    "myworkdayjobs.com": "workday",
    "smartrecruiters.com": "smartrecruiters",
    "ashbyhq.com": "ashby",
};
const RAW_URL_PATTERN = /https?:\/\/[^\s"'<>)}]+/gi;
export function detectAts(applyUrl, options = {}) {
    if (!applyUrl) {
        if (options.easyApply) {
            return {
                atsType: "linkedin_easy_apply",
                companyIdentifier: null,
                domain: "linkedin.com",
                applyUrl: null,
            };
        }
        return {
            atsType: "unknown",
            companyIdentifier: null,
            domain: null,
            applyUrl: null,
        };
    }
    const normalizedUrl = unwrapLinkedInRedirect(applyUrl);
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    for (const [domain, atsType] of Object.entries(DOMAIN_MAP)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
            return {
                atsType,
                companyIdentifier: extractCompanyIdentifier(atsType, parsed),
                domain,
                applyUrl: normalizedUrl,
            };
        }
    }
    return {
        atsType: "unknown",
        companyIdentifier: null,
        domain: hostname || null,
        applyUrl: normalizedUrl,
    };
}
export function extractKnownAtsUrls(text) {
    const normalizedText = decodeHtmlEntities(text).replace(/\\\//g, "/");
    const urls = [];
    for (const match of normalizedText.matchAll(RAW_URL_PATTERN)) {
        const candidate = normalizeAtsUrlCandidate(match[0]);
        if (candidate && !urls.includes(candidate)) {
            urls.push(candidate);
        }
    }
    return urls;
}
export function normalizeAtsUrlCandidate(value) {
    if (!value) {
        return null;
    }
    try {
        const candidate = unwrapLinkedInRedirect(value.trim());
        const parsed = new URL(candidate);
        const hostname = parsed.hostname.toLowerCase();
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return null;
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
export function unwrapLinkedInRedirect(value) {
    try {
        const parsed = new URL(value);
        if (!parsed.hostname.toLowerCase().includes("linkedin.com")) {
            return value;
        }
        const redirected = parsed.searchParams.get("url");
        return redirected ? decodeURIComponent(redirected) : value;
    }
    catch {
        return value;
    }
}
function extractCompanyIdentifier(atsType, parsedUrl) {
    const pathParts = parsedUrl.pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
    if (atsType === "greenhouse") {
        const queryCompany = parsedUrl.searchParams.get("for");
        return queryCompany || pathParts[0] || null;
    }
    if (atsType === "lever") {
        return pathParts[0] || null;
    }
    return null;
}
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
export { DOMAIN_MAP };
