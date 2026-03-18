declare const DOMAIN_MAP: {
    readonly "boards.greenhouse.io": "greenhouse";
    readonly "jobs.lever.co": "lever";
    readonly "myworkdayjobs.com": "workday";
    readonly "smartrecruiters.com": "smartrecruiters";
    readonly "ashbyhq.com": "ashby";
};
export type SupportedAtsType = (typeof DOMAIN_MAP)[keyof typeof DOMAIN_MAP];
export type DetectedAtsType = SupportedAtsType | "linkedin_easy_apply" | "unknown";
export interface AtsDetectionResult {
    atsType: DetectedAtsType;
    companyIdentifier: string | null;
    domain: string | null;
    applyUrl: string | null;
}
export declare function detectAts(applyUrl: string | null | undefined, options?: {
    easyApply?: boolean;
}): AtsDetectionResult;
export declare function extractKnownAtsUrls(text: string): string[];
export declare function normalizeAtsUrlCandidate(value: string): string | null;
export declare function unwrapLinkedInRedirect(value: string): string;
export { DOMAIN_MAP };
