import { apiCall } from "../api.js";

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
  skills?: Array<{ name: string }>;
  employmentHistory?: Array<{
    companyName: string;
    title: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }>;
  projects?: Array<{
    name: string;
    description?: string;
    url?: string;
    technologies?: string;
  }>;
}

export async function loadUserProfile(apiKey: string): Promise<UserProfile> {
  return (await apiCall("/api/profile", {}, apiKey)) as UserProfile;
}
