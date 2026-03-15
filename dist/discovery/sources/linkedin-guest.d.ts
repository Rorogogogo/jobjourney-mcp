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
export declare function parseLinkedInGuestSearchResults(html: string): LinkedInGuestSearchCard[];
export declare function parseLinkedInGuestJobDetail(html: string, options: {
    jobId: string;
    jobUrl?: string;
}): LinkedInGuestJobDetail;
