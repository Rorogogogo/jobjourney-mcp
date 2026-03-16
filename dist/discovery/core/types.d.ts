export type DiscoverySourceName = "linkedin" | "seek" | "indeed" | "jora";
export type DiscoveryJobSourceName = DiscoverySourceName | "greenhouse" | "lever";
export type AtsType = "unknown" | "linkedin_easy_apply" | "greenhouse" | "lever" | "workday" | "smartrecruiters" | "ashby";
export interface DiscoveryJob {
    id: string;
    source: DiscoveryJobSourceName;
    title: string;
    company: string;
    location: string;
    description: string;
    jobUrl: string;
    externalUrl: string;
    atsType: AtsType;
    atsIdentifier: string;
    postedAt: string | null;
    extractedAt: string;
    salary: string;
    salaryRaw: string;
    salaryMin: string;
    salaryMax: string;
    salaryCurrency: string;
    salaryPeriod: string;
    jobType: string;
    workArrangement: string;
    applicantCount: string;
    requiredSkills: string;
    techStack: string;
    experienceLevel: string;
    experienceYears: number | null;
    isPrRequired: boolean;
    securityClearance: string;
    prConfidence: string;
    prReasoning: string;
    companyLogoUrl: string;
    isAlreadyApplied: boolean;
    appliedDateUtc: string;
}
export interface DiscoveryRunOptions {
    keyword: string;
    location: string;
    sources?: DiscoverySourceName[];
    pages?: number;
    minDelay?: number;
    maxDelay?: number;
    careerDiscovery?: boolean;
    careerDiscoveryOnlyUnknown?: boolean;
    careerDiscoveryMaxProbes?: number;
    careerPaths?: string[];
}
export interface DiscoveryRunResult {
    jobs: DiscoveryJob[];
    sources: DiscoverySourceName[];
    failedSources: DiscoverySourceName[];
    expandedCompanies: string[];
}
export interface DiscoveryJobSeed {
    id: string;
    source: DiscoveryJobSourceName;
    title: string;
    company: string;
    location: string;
    description: string;
    jobUrl: string;
    extractedAt: string;
    postedAt?: string | null;
}
export declare function createEmptyDiscoveryJob(seed: DiscoveryJobSeed): DiscoveryJob;
