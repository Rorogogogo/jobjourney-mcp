import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerProfileTools(server: FastMCP) {
  server.addTool({
    name: "get_profile",
    description:
      "Get the user's profile information including skills, experience, education, and projects.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/profile")) as {
        data?: {
          firstName?: string; lastName?: string; email?: string;
          headline?: string; bio?: string; location?: string;
          skills?: Array<{ name: string }>;
          employments?: Array<{ companyName: string; title: string; startDate?: string; endDate?: string }>;
          educations?: Array<{ institution: string; degree: string; fieldOfStudy?: string }>;
          projects?: Array<{ name: string; description?: string }>;
        };
      };

      const p = data.data;
      if (!p) return "Could not retrieve profile.";

      const skills = p.skills?.map(s => s.name).join(", ") || "None listed";
      const employment = p.employments?.map(e =>
        `  - ${e.title} at ${e.companyName}${e.startDate ? ` (${e.startDate}${e.endDate ? ` - ${e.endDate}` : " - Present"})` : ""}`
      ).join("\n") || "  None listed";
      const education = p.educations?.map(e =>
        `  - ${e.degree}${e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ""} - ${e.institution}`
      ).join("\n") || "  None listed";
      const projects = p.projects?.map(pr =>
        `  - ${pr.name}${pr.description ? `: ${pr.description.substring(0, 80)}` : ""}`
      ).join("\n") || "  None listed";

      return [
        `${p.firstName || ""} ${p.lastName || ""}`.trim(),
        p.headline ? `${p.headline}` : null,
        p.email ? `Email: ${p.email}` : null,
        p.location ? `Location: ${p.location}` : null,
        p.bio ? `\nBio: ${p.bio}` : null,
        `\nSkills: ${skills}`,
        `\nExperience:\n${employment}`,
        `\nEducation:\n${education}`,
        `\nProjects:\n${projects}`,
      ].filter(Boolean).join("\n");
    },
  });

  server.addTool({
    name: "update_profile_basic",
    description: "Update basic profile information (name, headline, bio, location).",
    parameters: z.object({
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      headline: z.string().optional().describe("Professional headline"),
      bio: z.string().optional().describe("Bio/about section"),
      location: z.string().optional().describe("Location"),
    }),
    execute: async (args) => {
      const body: Record<string, string> = {};
      if (args.first_name) body.firstName = args.first_name;
      if (args.last_name) body.lastName = args.last_name;
      if (args.headline) body.headline = args.headline;
      if (args.bio) body.bio = args.bio;
      if (args.location) body.location = args.location;

      await apiCall("/api/profile/basic", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return "Basic profile information updated successfully.";
    },
  });

  server.addTool({
    name: "update_profile_skills",
    description: "Update the user's skills list.",
    parameters: z.object({
      skills: z.array(
        z.object({ name: z.string().describe("Skill name") })
      ).describe("List of skills"),
    }),
    execute: async (args) => {
      await apiCall("/api/profile/skills", {
        method: "PUT",
        body: JSON.stringify({ skills: args.skills }),
      });
      return "Skills updated successfully.";
    },
  });

  server.addTool({
    name: "update_profile_employment",
    description: "Update the user's employment history.",
    parameters: z.object({
      employments: z.array(
        z.object({
          companyName: z.string().describe("Company name"),
          title: z.string().describe("Job title"),
          startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
          endDate: z.string().optional().describe("End date (YYYY-MM-DD), omit if current"),
          description: z.string().optional().describe("Role description"),
        })
      ).describe("List of employment entries"),
    }),
    execute: async (args) => {
      await apiCall("/api/profile/employment", {
        method: "PUT",
        body: JSON.stringify({ employments: args.employments }),
      });
      return "Employment history updated successfully.";
    },
  });

  server.addTool({
    name: "update_profile_education",
    description: "Update the user's education history.",
    parameters: z.object({
      educations: z.array(
        z.object({
          institution: z.string().describe("Institution name"),
          degree: z.string().describe("Degree (e.g., Bachelor's, Master's)"),
          fieldOfStudy: z.string().optional().describe("Field of study"),
          startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
          endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        })
      ).describe("List of education entries"),
    }),
    execute: async (args) => {
      await apiCall("/api/profile/education", {
        method: "PUT",
        body: JSON.stringify({ educations: args.educations }),
      });
      return "Education history updated successfully.";
    },
  });

  server.addTool({
    name: "update_profile_projects",
    description: "Update the user's projects.",
    parameters: z.object({
      projects: z.array(
        z.object({
          name: z.string().describe("Project name"),
          description: z.string().optional().describe("Project description"),
          url: z.string().optional().describe("Project URL"),
          technologies: z.string().optional().describe("Technologies used"),
        })
      ).describe("List of projects"),
    }),
    execute: async (args) => {
      await apiCall("/api/profile/projects", {
        method: "PUT",
        body: JSON.stringify({ projects: args.projects }),
      });
      return "Projects updated successfully.";
    },
  });

  server.addTool({
    name: "update_profile_references",
    description: "Update the user's references.",
    parameters: z.object({
      references: z.array(
        z.object({
          name: z.string().describe("Reference name"),
          relationship: z.string().optional().describe("Relationship (e.g., 'Former Manager')"),
          company: z.string().optional().describe("Company name"),
          email: z.string().optional().describe("Contact email"),
          phone: z.string().optional().describe("Contact phone"),
        })
      ).describe("List of references"),
    }),
    execute: async (args) => {
      await apiCall("/api/profile/references", {
        method: "PUT",
        body: JSON.stringify({ references: args.references }),
      });
      return "References updated successfully.";
    },
  });

  server.addTool({
    name: "update_full_profile",
    description: "Update the entire user profile at once (all sections).",
    parameters: z.object({
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      headline: z.string().optional().describe("Professional headline"),
      bio: z.string().optional().describe("Bio/about section"),
      location: z.string().optional().describe("Location"),
      skills: z.array(z.object({ name: z.string() })).optional().describe("Skills list"),
      employments: z.array(z.object({
        companyName: z.string(), title: z.string(),
        startDate: z.string().optional(), endDate: z.string().optional(),
        description: z.string().optional(),
      })).optional().describe("Employment history"),
      educations: z.array(z.object({
        institution: z.string(), degree: z.string(),
        fieldOfStudy: z.string().optional(), startDate: z.string().optional(),
        endDate: z.string().optional(),
      })).optional().describe("Education history"),
      projects: z.array(z.object({
        name: z.string(), description: z.string().optional(),
        url: z.string().optional(), technologies: z.string().optional(),
      })).optional().describe("Projects list"),
      references: z.array(z.object({
        name: z.string(), relationship: z.string().optional(),
        company: z.string().optional(), email: z.string().optional(),
        phone: z.string().optional(),
      })).optional().describe("References list"),
    }),
    execute: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.first_name) body.firstName = args.first_name;
      if (args.last_name) body.lastName = args.last_name;
      if (args.headline) body.headline = args.headline;
      if (args.bio) body.bio = args.bio;
      if (args.location) body.location = args.location;
      if (args.skills) body.skills = args.skills;
      if (args.employments) body.employments = args.employments;
      if (args.educations) body.educations = args.educations;
      if (args.projects) body.projects = args.projects;
      if (args.references) body.references = args.references;

      await apiCall("/api/profile/full", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return "Full profile updated successfully.";
    },
  });

  server.addTool({
    name: "get_public_portfolio",
    description: "View someone's public portfolio by their identifier (username or slug).",
    parameters: z.object({
      identifier: z.string().describe("Portfolio identifier (username or slug)"),
    }),
    execute: async (args) => {
      const data = (await apiCall(`/api/profile/portfolio/${args.identifier}`)) as {
        data?: {
          displayName?: string; headline?: string; bio?: string;
          skills?: Array<{ name: string }>;
          employments?: Array<{ companyName: string; title: string }>;
          educations?: Array<{ institution: string; degree: string }>;
          projects?: Array<{ name: string; description?: string; url?: string }>;
        };
      };

      const p = data.data;
      if (!p) return "Portfolio not found.";

      const skills = p.skills?.map(s => s.name).join(", ") || "None listed";
      const employment = p.employments?.map(e => `  - ${e.title} at ${e.companyName}`).join("\n") || "  None listed";
      const education = p.educations?.map(e => `  - ${e.degree} - ${e.institution}`).join("\n") || "  None listed";
      const projects = p.projects?.map(pr =>
        `  - ${pr.name}${pr.description ? `: ${pr.description.substring(0, 80)}` : ""}${pr.url ? ` (${pr.url})` : ""}`
      ).join("\n") || "  None listed";

      return [
        `Portfolio: ${p.displayName || args.identifier}`,
        p.headline ? `${p.headline}` : null,
        p.bio ? `\n${p.bio}` : null,
        `\nSkills: ${skills}`,
        `\nExperience:\n${employment}`,
        `\nEducation:\n${education}`,
        `\nProjects:\n${projects}`,
      ].filter(Boolean).join("\n");
    },
  });
}
