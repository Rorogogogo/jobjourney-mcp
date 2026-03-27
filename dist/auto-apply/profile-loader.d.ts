export interface UserProfile {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    title?: string;
    headline?: string;
    bio?: string;
    location?: string;
    linkedinUrl?: string;
    websiteUrl?: string;
    githubUrl?: string;
    workAuthorization?: string;
    skills?: Array<{
        name: string;
        level?: string;
    }>;
    employmentHistory?: Array<{
        companyName: string;
        title: string;
        location?: string;
        startDate?: string;
        endDate?: string;
        bulletPoints?: string[];
    }>;
    education?: Array<{
        institution: string;
        degree: string;
        fieldOfStudy?: string;
        location?: string;
        startDate?: string;
        endDate?: string;
    }>;
    projects?: Array<{
        name: string;
        description?: string;
        url?: string;
        technologies?: string[];
    }>;
}
export declare function loadUserProfile(apiKey: string): Promise<UserProfile>;
