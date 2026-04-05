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
  githubUrl?: string;
  workAuthorization?: string;
  // Structured Address
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  // EEO
  gender?: string;
  pronouns?: string;
  ethnicity?: string;
  disabilityStatus?: string;
  veteranStatus?: string;
  // Salary
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  // Availability
  noticePeriod?: string;
  availableFrom?: string;
  requiresSponsorship?: boolean;
  // Additional
  dateOfBirth?: string;
  nationality?: string;
  citizenship?: string;
  preferredName?: string;
  defaultHowDidYouHear?: string;
  skills?: Array<{ name: string; level?: string }>;
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

/** Raw shape from the backend /api/profile endpoint */
interface ApiProfileResponse {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  title?: string;
  location?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  workAuthorization?: string;
  summary?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  gender?: string;
  pronouns?: string;
  ethnicity?: string;
  disabilityStatus?: string;
  veteranStatus?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  noticePeriod?: string;
  availableFrom?: string;
  requiresSponsorship?: boolean;
  dateOfBirth?: string;
  nationality?: string;
  citizenship?: string;
  preferredName?: string;
  defaultHowDidYouHear?: string;
  skills?: Array<{ name: string; level?: string }>;
  employmentHistory?: Array<{
    company: string;
    position: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    bulletPoints?: string[];
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
  }>;
  projects?: Array<{
    name: string;
    link?: string;
    bulletPoints?: string[];
    skills?: string[];
  }>;
}

export async function loadUserProfile(apiKey: string): Promise<UserProfile> {
  const raw = (await apiCall("/api/profile", {}, apiKey)) as ApiProfileResponse;
  return mapApiProfileToUserProfile(raw);
}

function mapApiProfileToUserProfile(raw: ApiProfileResponse): UserProfile {
  return {
    firstName: raw.firstName,
    lastName: raw.lastName,
    email: raw.email,
    phone: raw.phoneNumber,
    title: raw.title,
    bio: raw.summary,
    location: raw.location,
    websiteUrl: raw.websiteUrl,
    linkedinUrl: raw.linkedinUrl,
    githubUrl: raw.githubUrl,
    workAuthorization: raw.workAuthorization,
    street: raw.street,
    city: raw.city,
    state: raw.state,
    zipCode: raw.zipCode,
    country: raw.country,
    gender: raw.gender,
    pronouns: raw.pronouns,
    ethnicity: raw.ethnicity,
    disabilityStatus: raw.disabilityStatus,
    veteranStatus: raw.veteranStatus,
    salaryMin: raw.salaryMin,
    salaryMax: raw.salaryMax,
    salaryCurrency: raw.salaryCurrency,
    salaryPeriod: raw.salaryPeriod,
    noticePeriod: raw.noticePeriod,
    availableFrom: raw.availableFrom,
    requiresSponsorship: raw.requiresSponsorship,
    dateOfBirth: raw.dateOfBirth,
    nationality: raw.nationality,
    citizenship: raw.citizenship,
    preferredName: raw.preferredName,
    defaultHowDidYouHear: raw.defaultHowDidYouHear,
    skills: raw.skills,
    employmentHistory: raw.employmentHistory?.map((e) => ({
      companyName: e.company,
      title: e.position,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      bulletPoints: e.bulletPoints,
    })),
    education: raw.education?.map((e) => ({
      institution: e.institution ?? "",
      degree: e.degree ?? "",
      fieldOfStudy: e.field,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
    projects: raw.projects?.map((p) => ({
      name: p.name,
      description: p.bulletPoints?.join("\n"),
      url: p.link,
      technologies: p.skills,
    })),
  };
}
