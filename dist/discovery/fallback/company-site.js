import { detectAts, extractKnownAtsUrls } from "../ats/detector.js";
export const DEFAULT_CAREER_PATHS = [
    "/careers",
    "/jobs",
    "/careers/jobs",
    "/work-with-us",
];
const COMMON_COMPANY_SUFFIXES = new Set([
    "co",
    "company",
    "corp",
    "corporation",
    "group",
    "holdings",
    "inc",
    "incorporated",
    "limited",
    "llc",
    "ltd",
    "plc",
    "pty",
]);
const LOCATION_TLD_MAP = {
    australia: ["com.au"],
    "united kingdom": ["co.uk"],
    uk: ["co.uk"],
};
export class CompanyCareerDiscoverer {
    httpClient;
    careerPaths;
    maxProbes;
    perCompanyTimeoutMs;
    constructor(httpClient, options = {}) {
        this.httpClient = httpClient;
        this.careerPaths = normalizeCareerPaths(options.careerPaths ?? DEFAULT_CAREER_PATHS);
        this.maxProbes = Math.max(1, options.maxProbes ?? 6);
        this.perCompanyTimeoutMs = options.perCompanyTimeoutMs ?? 8000;
        this.logger = options.logger;
    }
    logger;
    async discover(input) {
        return Promise.race([
            this.discoverImpl(input),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Career discovery timed out for ${input.companyName}`)), this.perCompanyTimeoutMs)),
        ]);
    }
    async discoverImpl(input) {
        const domains = inferCompanyDomains(input.companyName, input.location ?? "", this.maxProbes);
        if (domains.length === 0) {
            const result = {
                companyName: input.companyName,
                inferredDomain: null,
                probedUrls: [],
                atsType: "unknown",
                companyIdentifier: null,
                applyUrl: null,
                outcome: "no_domain_candidates",
            };
            this.log("career_discovery_result", resultLogFields(result));
            return result;
        }
        const probedUrls = [];
        const firstDomain = domains[0];
        let probeCount = 0;
        for (const domain of domains) {
            for (const path of this.careerPaths) {
                if (probeCount >= this.maxProbes) {
                    const result = {
                        companyName: input.companyName,
                        inferredDomain: domain,
                        probedUrls,
                        atsType: "unknown",
                        companyIdentifier: null,
                        applyUrl: null,
                        outcome: "probe_limit_reached",
                    };
                    this.log("career_discovery_result", resultLogFields(result));
                    return result;
                }
                probeCount += 1;
                const probeUrl = `https://${domain}${path}`;
                probedUrls.push(probeUrl);
                this.log("career_discovery_probe", {
                    company: input.companyName,
                    inferredDomain: domain,
                    probeUrl,
                    probeIndex: probeCount,
                });
                let response;
                try {
                    response = await this.httpClient.get(probeUrl);
                }
                catch (error) {
                    this.log("career_discovery_probe_error", {
                        company: input.companyName,
                        inferredDomain: domain,
                        probeUrl,
                        probeIndex: probeCount,
                        outcome: "probe_error",
                        error: error instanceof Error ? error.message : String(error),
                    });
                    continue;
                }
                const responseUrl = typeof response.url === "string" && response.url ? response.url : probeUrl;
                const responseText = await getResponseText(response);
                const redirectDetection = detectAts(responseUrl);
                if (redirectDetection.atsType !== "unknown") {
                    const result = {
                        companyName: input.companyName,
                        inferredDomain: domain,
                        probedUrls,
                        atsType: redirectDetection.atsType,
                        companyIdentifier: redirectDetection.companyIdentifier,
                        applyUrl: redirectDetection.applyUrl,
                        outcome: "ats_detected",
                    };
                    this.log("career_discovery_result", resultLogFields(result));
                    return result;
                }
                for (const candidateUrl of extractKnownAtsUrls(responseText)) {
                    const detection = detectAts(candidateUrl);
                    if (detection.atsType === "unknown") {
                        continue;
                    }
                    const result = {
                        companyName: input.companyName,
                        inferredDomain: domain,
                        probedUrls,
                        atsType: detection.atsType,
                        companyIdentifier: detection.companyIdentifier,
                        applyUrl: detection.applyUrl,
                        outcome: "ats_detected",
                    };
                    this.log("career_discovery_result", resultLogFields(result));
                    return result;
                }
            }
        }
        const result = {
            companyName: input.companyName,
            inferredDomain: firstDomain,
            probedUrls,
            atsType: "unknown",
            companyIdentifier: null,
            applyUrl: null,
            outcome: "no_ats_detected",
        };
        this.log("career_discovery_result", resultLogFields(result));
        return result;
    }
    log(event, payload) {
        if (!this.logger) {
            return;
        }
        this.logger({ event, ...payload });
    }
}
export function inferCompanyDomains(companyName, location = "", maxCandidates = 6) {
    const tokens = (companyName.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice();
    while (tokens.length > 0 && COMMON_COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) {
        tokens.pop();
    }
    if (tokens.length === 0) {
        return [];
    }
    const baseCompact = tokens.join("");
    const baseHyphen = tokens.join("-");
    const baseNames = [baseCompact];
    if (baseHyphen && baseHyphen !== baseCompact) {
        baseNames.push(baseHyphen);
    }
    if (baseCompact && !baseCompact.endsWith("hq")) {
        baseNames.push(`${baseCompact}hq`);
    }
    const tlds = ["com"];
    const locationLower = location.toLowerCase();
    for (const [marker, extras] of Object.entries(LOCATION_TLD_MAP)) {
        if (locationLower.includes(marker)) {
            for (const tld of extras) {
                if (!tlds.includes(tld)) {
                    tlds.push(tld);
                }
            }
        }
    }
    for (const tld of ["io", "co"]) {
        if (!tlds.includes(tld)) {
            tlds.push(tld);
        }
    }
    const candidates = [];
    for (const baseName of baseNames) {
        if (!baseName) {
            continue;
        }
        for (const tld of tlds) {
            candidates.push(`${baseName}.${tld}`);
        }
        candidates.push(`www.${baseName}.com`);
    }
    const uniqueCandidates = [];
    const seen = new Set();
    for (const candidate of candidates) {
        if (seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        uniqueCandidates.push(candidate);
        if (uniqueCandidates.length >= maxCandidates) {
            break;
        }
    }
    return uniqueCandidates;
}
export function shouldRunCareerDiscovery(input) {
    if (!input.enabled || input.applyUrl) {
        return false;
    }
    if (input.onlyUnknown) {
        return input.atsType === "unknown";
    }
    return input.atsType === "unknown" || input.atsType === "linkedin_easy_apply";
}
export async function getCachedCareerDiscoveryResult(input) {
    const cacheKey = input.companyName.trim().toLowerCase();
    const cached = input.cache.get(cacheKey);
    if (cached) {
        return cached;
    }
    (input.logger ?? (() => { }))({
        event: "career_discovery_start",
        company: input.companyName,
        atsType: input.atsType,
        outcome: "started",
    });
    const result = await input.careerDiscoverer.discover({
        companyName: input.companyName,
        location: input.location,
    });
    input.cache.set(cacheKey, result);
    return result;
}
function normalizeCareerPaths(paths) {
    const normalizedPaths = [];
    const seen = new Set();
    for (const path of paths) {
        let cleaned = path.trim();
        if (!cleaned) {
            continue;
        }
        if (!cleaned.startsWith("/")) {
            cleaned = `/${cleaned}`;
        }
        if (seen.has(cleaned)) {
            continue;
        }
        seen.add(cleaned);
        normalizedPaths.push(cleaned);
    }
    return normalizedPaths.length > 0 ? normalizedPaths : [...DEFAULT_CAREER_PATHS];
}
function resultLogFields(result) {
    return {
        company: result.companyName,
        inferredDomain: result.inferredDomain,
        probedUrls: result.probedUrls,
        atsType: result.atsType,
        atsIdentifier: result.companyIdentifier,
        applyUrl: result.applyUrl,
        outcome: result.outcome,
    };
}
async function getResponseText(response) {
    if (typeof response.text === "string") {
        return response.text;
    }
    if (typeof response.text === "function") {
        return response.text();
    }
    return "";
}
