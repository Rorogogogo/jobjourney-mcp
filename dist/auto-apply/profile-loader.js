import { apiCall } from "../api.js";
export async function loadUserProfile(apiKey) {
    const raw = (await apiCall("/api/profile", {}, apiKey));
    return mapApiProfileToUserProfile(raw);
}
function mapApiProfileToUserProfile(raw) {
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
