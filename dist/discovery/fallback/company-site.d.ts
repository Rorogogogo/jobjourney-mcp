export declare const DEFAULT_CAREER_PATHS: string[];
export interface CareerDiscoveryResult {
    companyName: string;
    inferredDomain: string | null;
    probedUrls: string[];
    atsType: string;
    companyIdentifier: string | null;
    applyUrl: string | null;
    outcome: string;
}
export interface CareerDiscoveryLogger {
    (payload: Record<string, unknown>): void;
}
export interface CompanyCareerDiscovererLike {
    discover(input: {
        companyName: string;
        location?: string;
    }): Promise<CareerDiscoveryResult>;
}
interface HttpResponseLike {
    url?: string;
    text?: string | (() => Promise<string>);
}
interface HttpClientLike {
    get(url: string): Promise<HttpResponseLike>;
}
interface CompanyCareerDiscovererOptions {
    careerPaths?: string[];
    maxProbes?: number;
    logger?: CareerDiscoveryLogger;
}
export declare class CompanyCareerDiscoverer implements CompanyCareerDiscovererLike {
    private readonly httpClient;
    readonly careerPaths: string[];
    readonly maxProbes: number;
    constructor(httpClient: HttpClientLike, options?: CompanyCareerDiscovererOptions);
    private readonly logger?;
    discover(input: {
        companyName: string;
        location?: string;
    }): Promise<CareerDiscoveryResult>;
    private log;
}
export declare function inferCompanyDomains(companyName: string, location?: string, maxCandidates?: number): string[];
export declare function shouldRunCareerDiscovery(input: {
    enabled: boolean;
    onlyUnknown: boolean;
    applyUrl: string | null;
    atsType: string;
}): boolean;
export declare function getCachedCareerDiscoveryResult(input: {
    cache: Map<string, unknown>;
    companyName: string;
    location: string;
    atsType: string;
    careerDiscoverer: CompanyCareerDiscovererLike;
    logger?: CareerDiscoveryLogger;
}): Promise<unknown>;
export {};
