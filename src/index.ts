#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration from environment variables
const API_BASE_URL = process.env.JOBJOURNEY_API_URL || "http://localhost:5014";
const API_KEY = process.env.JOBJOURNEY_API_KEY || "";

// Job status constants (matching backend)
const JOB_STATUS = {
  EXPIRED: 0,
  SAVED: 1,
  APPLIED: 2,
  INITIAL_INTERVIEW: 3,
  FINAL_INTERVIEW: 4,
  OFFERED: 5,
  REJECTED: 6,
} as const;

const STATUS_TEXT: Record<number, string> = {
  0: "Expired",
  1: "Saved",
  2: "Applied",
  3: "Initial Interview",
  4: "Final Interview",
  5: "Offered",
  6: "Rejected",
};

// Helper for API calls
async function apiCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(API_KEY && { "X-API-Key": API_KEY }),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Create the MCP server
const server = new Server(
  {
    name: "jobjourney-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "save_job",
        description:
          "Save a new job application to track. Use this when the user wants to save or add a job they're interested in or have applied to.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Job title (e.g., 'Software Engineer')",
            },
            company: {
              type: "string",
              description: "Company name",
            },
            location: {
              type: "string",
              description: "Job location (optional)",
            },
            job_url: {
              type: "string",
              description: "URL to the job posting (optional)",
            },
            description: {
              type: "string",
              description: "Job description (optional)",
            },
            status: {
              type: "string",
              enum: ["saved", "applied", "initial_interview", "final_interview", "offered", "rejected"],
              description: "Current application status (default: saved)",
            },
            is_starred: {
              type: "boolean",
              description: "Mark as important/starred (default: false)",
            },
          },
          required: ["title", "company"],
        },
      },
      {
        name: "get_jobs",
        description:
          "Get the user's saved jobs with their current status. Use this to check job application status, list all jobs, or find specific jobs.",
        inputSchema: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Search by job title or company name (optional)",
            },
            status: {
              type: "string",
              enum: ["saved", "applied", "initial_interview", "final_interview", "offered", "rejected", "expired"],
              description: "Filter by status (optional)",
            },
            starred_only: {
              type: "boolean",
              description: "Only show starred jobs (optional)",
            },
            limit: {
              type: "number",
              description: "Maximum number of jobs to return (default: 10)",
            },
          },
        },
      },
      {
        name: "update_job_status",
        description:
          "Update the status of a job application. Use this when the user's application progresses (got an interview, received offer, was rejected, etc.)",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "string",
              description: "The job ID to update",
            },
            status: {
              type: "string",
              enum: ["saved", "applied", "initial_interview", "final_interview", "offered", "rejected", "expired"],
              description: "New status for the job",
            },
          },
          required: ["job_id", "status"],
        },
      },
      {
        name: "find_coffee_contacts",
        description:
          "Find people available for coffee chats / networking. Use this when the user wants to connect with professionals, find mentors, or network in a specific industry.",
        inputSchema: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Search by name, title, or bio (optional)",
            },
            industry: {
              type: "string",
              description: "Filter by industry (e.g., 'Technology', 'Finance') (optional)",
            },
            help_topics: {
              type: "array",
              items: { type: "string" },
              description: "Topics they can help with (e.g., ['resume review', 'interview prep']) (optional)",
            },
            limit: {
              type: "number",
              description: "Maximum number of contacts to return (default: 10)",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "save_job": {
        const statusMap: Record<string, number> = {
          saved: JOB_STATUS.SAVED,
          applied: JOB_STATUS.APPLIED,
          initial_interview: JOB_STATUS.INITIAL_INTERVIEW,
          final_interview: JOB_STATUS.FINAL_INTERVIEW,
          offered: JOB_STATUS.OFFERED,
          rejected: JOB_STATUS.REJECTED,
        };

        const formData = new FormData();
        formData.append("Name", String(args?.title || ""));
        formData.append("CompanyName", String(args?.company || ""));
        if (args?.location) formData.append("Location", String(args.location));
        // JobUrl is required by backend - use provided URL or generate a placeholder
        const jobUrl = args?.job_url || `https://jobjourney.me/manual/${Date.now()}`;
        formData.append("JobUrl", String(jobUrl));
        if (args?.description) formData.append("Description", String(args.description));
        formData.append("Status", String(statusMap[String(args?.status || "saved")] || JOB_STATUS.SAVED));
        formData.append("IsStarred", String(args?.is_starred || false));

        const result = await fetch(`${API_BASE_URL}/api/Job/manually-save`, {
          method: "POST",
          headers: {
            ...(API_KEY && { "X-API-Key": API_KEY }),
          },
          body: formData,
        });

        const data = await result.json();

        return {
          content: [
            {
              type: "text",
              text: data.isSuccess !== false
                ? `Job saved successfully!\n\nTitle: ${args?.title}\nCompany: ${args?.company}\nStatus: ${args?.status || "saved"}`
                : `Failed to save job: ${data.message || "Unknown error"}`,
            },
          ],
        };
      }

      case "get_jobs": {
        const statusMap: Record<string, number> = {
          expired: 0,
          saved: 1,
          applied: 2,
          initial_interview: 3,
          final_interview: 4,
          offered: 5,
          rejected: 6,
        };

        const params = new URLSearchParams();
        params.append("pageNumber", "1");
        params.append("pageSize", String(args?.limit || 10));
        if (args?.search) params.append("searchText", String(args.search));
        if (args?.status) params.append("status", String(statusMap[String(args.status)]));
        if (args?.starred_only) params.append("isStarred", "true");

        const data = (await apiCall(`/api/Job?${params.toString()}`)) as {
          items?: Array<{
            id: string;
            name: string;
            companyName: string;
            status: string;
            isStarred: boolean;
            createdOnUtc: string;
            location?: string;
          }>;
          totalCount?: number;
        };

        if (!data.items || data.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No jobs found matching your criteria.",
              },
            ],
          };
        }

        const jobList = data.items
          .map((job, i) => {
            const status = STATUS_TEXT[parseInt(job.status)] || job.status;
            const star = job.isStarred ? " ⭐" : "";
            return `${i + 1}. ${job.name} at ${job.companyName}${star}\n   Status: ${status}\n   ID: ${job.id}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${data.totalCount} job(s):\n\n${jobList}`,
            },
          ],
        };
      }

      case "update_job_status": {
        const statusMap: Record<string, number> = {
          expired: 0,
          saved: 1,
          applied: 2,
          initial_interview: 3,
          final_interview: 4,
          offered: 5,
          rejected: 6,
        };

        const jobId = String(args?.job_id);
        const newStatus = statusMap[String(args?.status)];

        if (newStatus === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid status: ${args?.status}. Valid options: saved, applied, initial_interview, final_interview, offered, rejected, expired`,
              },
            ],
          };
        }

        await apiCall(`/api/Job/${jobId}/status/${newStatus}`, {
          method: "PUT",
        });

        return {
          content: [
            {
              type: "text",
              text: `Job status updated to: ${STATUS_TEXT[newStatus]}`,
            },
          ],
        };
      }

      case "find_coffee_contacts": {
        const params = new URLSearchParams();
        params.append("page", "1");
        params.append("pageSize", String(args?.limit || 10));
        if (args?.search) params.append("searchText", String(args.search));
        if (args?.industry) params.append("industry", String(args.industry));
        if (args?.help_topics && Array.isArray(args.help_topics)) {
          args.help_topics.forEach((topic: string) => {
            params.append("helpTopics", topic);
          });
        }

        const data = (await apiCall(`/api/CoffeeChat/profiles?${params.toString()}`)) as {
          data?: {
            items?: Array<{
              userId: string;
              displayName: string;
              headline?: string;
              industry?: string;
              helpTopics?: string[];
              yearsExperience?: number;
            }>;
            totalCount?: number;
          };
        };

        const profiles = data.data?.items || [];

        if (profiles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No coffee chat contacts found matching your criteria.",
              },
            ],
          };
        }

        const contactList = profiles
          .map((profile, i) => {
            const topics = profile.helpTopics?.join(", ") || "General";
            return `${i + 1}. ${profile.displayName}\n   ${profile.headline || "Professional"}\n   Industry: ${profile.industry || "Not specified"}\n   Can help with: ${topics}\n   Experience: ${profile.yearsExperience || "?"} years`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${data.data?.totalCount || profiles.length} contact(s) for coffee chat:\n\n${contactList}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("JobJourney MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
