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

const STATUS_MAP: Record<string, number> = {
  expired: 0,
  saved: 1,
  applied: 2,
  initial_interview: 3,
  final_interview: 4,
  offered: 5,
  rejected: 6,
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

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// Create the MCP server
const server = new Server(
  {
    name: "jobjourney-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ---- JOB MANAGEMENT ----
      {
        name: "save_job",
        description:
          "Save a new job application to track. Use this when the user wants to save or add a job they're interested in or have applied to.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Job title (e.g., 'Software Engineer')" },
            company: { type: "string", description: "Company name" },
            location: { type: "string", description: "Job location (optional)" },
            job_url: { type: "string", description: "URL to the job posting (optional)" },
            description: { type: "string", description: "Job description (optional)" },
            required_skills: { type: "string", description: "Required skills (optional)" },
            status: {
              type: "string",
              enum: ["saved", "applied", "initial_interview", "final_interview", "offered", "rejected"],
              description: "Current application status (default: saved)",
            },
            is_starred: { type: "boolean", description: "Mark as important/starred (default: false)" },
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
            search: { type: "string", description: "Search by job title or company name (optional)" },
            status: {
              type: "string",
              enum: ["saved", "applied", "initial_interview", "final_interview", "offered", "rejected", "expired"],
              description: "Filter by status (optional)",
            },
            starred_only: { type: "boolean", description: "Only show starred jobs (optional)" },
            limit: { type: "number", description: "Maximum number of jobs to return (default: 10)" },
          },
        },
      },
      {
        name: "get_job_details",
        description:
          "Get full details of a specific job by ID, including description, skills, notes, and evaluation data.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "The job ID to get details for" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "update_job_status",
        description:
          "Update the status of a job application. Use this when the user's application progresses (got an interview, received offer, was rejected, etc.)",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "The job ID to update" },
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
        name: "delete_job",
        description: "Delete a saved job. Use this when the user wants to remove a job from their list.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "The job ID to delete" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "star_job",
        description: "Star or unstar a job to mark it as important.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "The job ID to star/unstar" },
            is_starred: { type: "boolean", description: "true to star, false to unstar" },
          },
          required: ["job_id", "is_starred"],
        },
      },
      {
        name: "add_job_note",
        description:
          "Add a note to a job application. Use this when the user wants to record information about a job (e.g., interviewer name, follow-up date, salary info).",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string", description: "The job ID to add a note to" },
            content: { type: "string", description: "The note content" },
          },
          required: ["job_id", "content"],
        },
      },
      {
        name: "bulk_update_jobs",
        description:
          "Perform bulk operations on multiple jobs at once: delete, reject, or advance to next stage.",
        inputSchema: {
          type: "object",
          properties: {
            job_ids: {
              type: "array",
              items: { type: "string" },
              description: "Array of job IDs to update",
            },
            action: {
              type: "string",
              enum: ["delete", "reject", "proceed"],
              description: "Action to perform: delete (remove), reject (mark as not a fit), proceed (advance to next stage)",
            },
          },
          required: ["job_ids", "action"],
        },
      },

      // ---- DASHBOARD & INSIGHTS ----
      {
        name: "get_dashboard_stats",
        description:
          "Get an overview of the user's job search progress including job counts by status, scraping metrics, document counts, and feature usage. Great for answering 'how is my job search going?'",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // ---- AI TOOLS ----
      {
        name: "evaluate_job_fit",
        description:
          "Use AI to evaluate how well the user's profile/resume matches a specific job. Returns a fit score and detailed analysis.",
        inputSchema: {
          type: "object",
          properties: {
            job_title: { type: "string", description: "Job title" },
            company: { type: "string", description: "Company name (optional)" },
            description: { type: "string", description: "Job description" },
            required_skills: { type: "string", description: "Required skills for the job (optional)" },
            job_id: { type: "string", description: "Existing job ID to evaluate against (optional, if job is already saved)" },
          },
          required: ["job_title", "description"],
        },
      },
      {
        name: "generate_cover_letter",
        description:
          "Use AI to generate a tailored cover letter for a specific job based on the user's profile/resume.",
        inputSchema: {
          type: "object",
          properties: {
            job_title: { type: "string", description: "Job title" },
            company: { type: "string", description: "Company name (optional)" },
            description: { type: "string", description: "Job description" },
            required_skills: { type: "string", description: "Required skills (optional)" },
            job_id: { type: "string", description: "Existing job ID (optional, to save the cover letter to the job)" },
          },
          required: ["job_title", "description"],
        },
      },
      {
        name: "generate_interview_questions",
        description:
          "Use AI to generate practice interview questions for a specific job. Choose between technical or behavioral questions.",
        inputSchema: {
          type: "object",
          properties: {
            job_title: { type: "string", description: "Job title" },
            company: { type: "string", description: "Company name (optional)" },
            description: { type: "string", description: "Job description (optional)" },
            required_skills: { type: "string", description: "Required skills (optional)" },
            interview_type: {
              type: "string",
              enum: ["Technical", "Behavioral"],
              description: "Type of interview questions (default: Technical)",
            },
          },
          required: ["job_title"],
        },
      },

      // ---- COFFEE CHAT / NETWORKING ----
      {
        name: "find_coffee_contacts",
        description:
          "Find people available for coffee chats / networking. Use this when the user wants to connect with professionals, find mentors, or network in a specific industry.",
        inputSchema: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search by name, title, or bio (optional)" },
            industry: { type: "string", description: "Filter by industry (e.g., 'Technology', 'Finance') (optional)" },
            help_topics: {
              type: "array",
              items: { type: "string" },
              description: "Topics they can help with (e.g., ['resume review', 'interview prep']) (optional)",
            },
            limit: { type: "number", description: "Maximum number of contacts to return (default: 10)" },
          },
        },
      },
      {
        name: "send_coffee_chat_request",
        description:
          "Send a coffee chat request to a user. Use this after finding contacts with find_coffee_contacts.",
        inputSchema: {
          type: "object",
          properties: {
            receiver_id: { type: "string", description: "The user ID of the person to send the request to" },
            message: { type: "string", description: "A personalized message (20-500 characters) explaining why you'd like to chat" },
          },
          required: ["receiver_id", "message"],
        },
      },
      {
        name: "get_coffee_chat_requests",
        description:
          "Get the user's coffee chat requests - either sent or received.",
        inputSchema: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: ["sent", "received"],
              description: "Whether to get sent or received requests (default: sent)",
            },
          },
        },
      },

      // ---- NOTIFICATIONS ----
      {
        name: "get_notifications",
        description:
          "Get the user's notifications. Use this when the user asks about updates, alerts, or what's new.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of notifications to return (default: 10)" },
          },
        },
      },
      {
        name: "mark_notifications_read",
        description: "Mark all notifications as read.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // ---- PROFILE ----
      {
        name: "get_profile",
        description:
          "Get the user's profile information including skills, experience, education, and projects.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// ============================================================================
// TOOL HANDLERS
// ============================================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ======================================================================
      // JOB MANAGEMENT
      // ======================================================================
      case "save_job": {
        const formData = new FormData();
        formData.append("Name", String(args?.title || ""));
        formData.append("CompanyName", String(args?.company || ""));
        if (args?.location) formData.append("Location", String(args.location));
        const jobUrl = args?.job_url || `https://jobjourney.me/manual/${Date.now()}`;
        formData.append("JobUrl", String(jobUrl));
        if (args?.description) formData.append("Description", String(args.description));
        if (args?.required_skills) formData.append("RequiredSkills", String(args.required_skills));
        formData.append("Status", String(STATUS_MAP[String(args?.status || "saved")] || JOB_STATUS.SAVED));
        formData.append("IsStarred", String(args?.is_starred || false));

        const result = await fetch(`${API_BASE_URL}/api/Job/manually-save`, {
          method: "POST",
          headers: { ...(API_KEY && { "X-API-Key": API_KEY }) },
          body: formData,
        });
        const data = await result.json();

        return data.isSuccess !== false
          ? textResult(`Job saved successfully!\n\nTitle: ${args?.title}\nCompany: ${args?.company}\nStatus: ${args?.status || "saved"}${data.data?.id ? `\nID: ${data.data.id}` : ""}`)
          : textResult(`Failed to save job: ${data.message || "Unknown error"}`);
      }

      case "get_jobs": {
        const params = new URLSearchParams();
        params.append("pageNumber", "1");
        params.append("pageSize", String(args?.limit || 10));
        if (args?.search) params.append("searchText", String(args.search));
        if (args?.status) params.append("status", String(STATUS_MAP[String(args.status)]));
        if (args?.starred_only) params.append("isStarred", "true");

        const data = (await apiCall(`/api/Job?${params.toString()}`)) as {
          items?: Array<{
            id: string; name: string; companyName: string; status: string;
            isStarred: boolean; createdOnUtc: string; location?: string;
          }>;
          totalCount?: number;
        };

        if (!data.items || data.items.length === 0) {
          return textResult("No jobs found matching your criteria.");
        }

        const jobList = data.items
          .map((job, i) => {
            const status = STATUS_TEXT[parseInt(job.status)] || job.status;
            const star = job.isStarred ? " ⭐" : "";
            const loc = job.location ? `\n   Location: ${job.location}` : "";
            return `${i + 1}. ${job.name} at ${job.companyName}${star}\n   Status: ${status}${loc}\n   ID: ${job.id}`;
          })
          .join("\n\n");

        return textResult(`Found ${data.totalCount} job(s):\n\n${jobList}`);
      }

      case "get_job_details": {
        const jobId = String(args?.job_id);
        const data = (await apiCall(`/api/Job/${jobId}`)) as {
          data?: {
            id: string; name: string; companyName: string; status: string;
            isStarred: boolean; location?: string; description?: string;
            requiredSkills?: string; jobUrl?: string; createdOnUtc: string;
            statusUpdatedOnUtc?: string; employmentTypes?: string;
            workArrangement?: string; notes?: Array<{ id: string; content: string; createdOnUtc: string }>;
          };
        };

        const job = data.data;
        if (!job) return textResult("Job not found.");

        const status = STATUS_TEXT[parseInt(job.status)] || job.status;
        const notes = job.notes?.map((n, i) => `  ${i + 1}. ${n.content} (${new Date(n.createdOnUtc).toLocaleDateString()})`).join("\n") || "  None";

        return textResult([
          `📋 ${job.name} at ${job.companyName}${job.isStarred ? " ⭐" : ""}`,
          `Status: ${status}`,
          job.location ? `Location: ${job.location}` : null,
          job.employmentTypes ? `Type: ${job.employmentTypes}` : null,
          job.workArrangement ? `Arrangement: ${job.workArrangement}` : null,
          job.jobUrl ? `URL: ${job.jobUrl}` : null,
          job.description ? `\nDescription:\n${job.description.substring(0, 500)}${job.description.length > 500 ? "..." : ""}` : null,
          job.requiredSkills ? `\nRequired Skills: ${job.requiredSkills}` : null,
          `\nNotes:\n${notes}`,
          `\nSaved: ${new Date(job.createdOnUtc).toLocaleDateString()}`,
          job.statusUpdatedOnUtc ? `Last updated: ${new Date(job.statusUpdatedOnUtc).toLocaleDateString()}` : null,
          `ID: ${job.id}`,
        ].filter(Boolean).join("\n"));
      }

      case "update_job_status": {
        const jobId = String(args?.job_id);
        const newStatus = STATUS_MAP[String(args?.status)];
        if (newStatus === undefined) {
          return textResult(`Invalid status: ${args?.status}. Valid options: saved, applied, initial_interview, final_interview, offered, rejected, expired`);
        }
        await apiCall(`/api/Job/${jobId}/status/${newStatus}`, { method: "PUT" });
        return textResult(`Job status updated to: ${STATUS_TEXT[newStatus]}`);
      }

      case "delete_job": {
        const jobId = String(args?.job_id);
        await apiCall(`/api/Job/${jobId}`, { method: "DELETE" });
        return textResult("Job deleted successfully.");
      }

      case "star_job": {
        const jobId = String(args?.job_id);
        await apiCall(`/api/Job/${jobId}/star`, {
          method: "PUT",
          body: JSON.stringify({ isStarred: args?.is_starred }),
        });
        return textResult(`Job ${args?.is_starred ? "starred ⭐" : "unstarred"} successfully.`);
      }

      case "add_job_note": {
        const jobId = String(args?.job_id);
        const data = (await apiCall(`/api/Job/${jobId}/notes`, {
          method: "POST",
          body: JSON.stringify({ content: String(args?.content) }),
        })) as { data?: { id: string; content: string } };

        return textResult(`Note added to job successfully.${data.data?.id ? `\nNote ID: ${data.data.id}` : ""}`);
      }

      case "bulk_update_jobs": {
        const jobIds = args?.job_ids as string[];
        const action = String(args?.action);
        const actionMap: Record<string, string> = {
          delete: "/api/bulk-job/delete",
          reject: "/api/bulk-job/reject",
          proceed: "/api/bulk-job/proceed",
        };
        const endpoint = actionMap[action];
        if (!endpoint) return textResult("Invalid action. Use: delete, reject, or proceed.");

        await apiCall(endpoint, {
          method: "POST",
          body: JSON.stringify({ jobIds }),
        });

        const actionText: Record<string, string> = {
          delete: "deleted",
          reject: "marked as rejected",
          proceed: "advanced to next stage",
        };
        return textResult(`${jobIds.length} job(s) ${actionText[action]} successfully.`);
      }

      // ======================================================================
      // DASHBOARD & INSIGHTS
      // ======================================================================
      case "get_dashboard_stats": {
        const data = (await apiCall("/api/dashboard/statistics")) as {
          data?: {
            jobStatistics?: {
              total: number; applied: number; interview: number;
              offer: number; rejected: number; starred: number; savedOnly: number;
            };
            scrapingMetrics?: {
              totalJobsScraped: number; totalWebsites: number;
              averageJobsPerScrape: number; successRate: number;
            };
            documentStatistics?: { totalCvs: number; totalCoverLetters: number };
            portfolioMetrics?: { visitsThisMonth: number };
            featureUsage?: Record<string, number>;
          };
        };

        const stats = data.data;
        if (!stats) return textResult("Could not retrieve dashboard statistics.");

        const js = stats.jobStatistics;
        const sm = stats.scrapingMetrics;
        const ds = stats.documentStatistics;

        return textResult([
          "📊 Job Search Dashboard",
          "═══════════════════════",
          "",
          "Jobs Overview:",
          js ? `  Total: ${js.total} | Applied: ${js.applied} | Interview: ${js.interview}` : null,
          js ? `  Offers: ${js.offer} | Rejected: ${js.rejected} | Starred: ${js.starred}` : null,
          "",
          sm ? `Scraping: ${sm.totalJobsScraped} jobs scraped from ${sm.totalWebsites} websites` : null,
          ds ? `Documents: ${ds.totalCvs} CVs, ${ds.totalCoverLetters} cover letters` : null,
          stats.portfolioMetrics ? `Portfolio: ${stats.portfolioMetrics.visitsThisMonth} visits this month` : null,
        ].filter(Boolean).join("\n"));
      }

      // ======================================================================
      // AI TOOLS
      // ======================================================================
      case "evaluate_job_fit": {
        const jobObj: Record<string, string | undefined> = {
          name: String(args?.job_title),
          companyName: args?.company ? String(args.company) : undefined,
          description: args?.description ? String(args.description) : undefined,
          requiredSkills: args?.required_skills ? String(args.required_skills) : undefined,
        };
        if (args?.job_id) jobObj.id = String(args.job_id);
        const body = { job: jobObj };

        const data = (await apiCall("/api/ai/evaluate-job-fit?confirmFreeTrial=true", {
          method: "POST",
          body: JSON.stringify(body),
        })) as {
          data?: {
            overallScore?: number;
            summary?: string;
            strengths?: string[];
            weaknesses?: string[];
            recommendations?: string[];
          };
          message?: string;
          errorCode?: string;
        };

        if (data.errorCode) {
          return textResult(`Evaluation failed: ${data.message || data.errorCode}`);
        }

        const eval_ = data.data;
        if (!eval_) return textResult("No evaluation data returned.");

        return textResult([
          `🎯 Job Fit Evaluation: ${args?.job_title}${args?.company ? ` at ${args.company}` : ""}`,
          `Score: ${eval_.overallScore ?? "N/A"}/100`,
          "",
          eval_.summary ? `Summary: ${eval_.summary}` : null,
          eval_.strengths?.length ? `\nStrengths:\n${eval_.strengths.map(s => `  ✅ ${s}`).join("\n")}` : null,
          eval_.weaknesses?.length ? `\nWeaknesses:\n${eval_.weaknesses.map(w => `  ⚠️ ${w}`).join("\n")}` : null,
          eval_.recommendations?.length ? `\nRecommendations:\n${eval_.recommendations.map(r => `  💡 ${r}`).join("\n")}` : null,
        ].filter(Boolean).join("\n"));
      }

      case "generate_cover_letter": {
        const body: Record<string, unknown> = {
          job: {
            name: String(args?.job_title),
            companyName: args?.company ? String(args.company) : undefined,
            description: args?.description ? String(args.description) : undefined,
            requiredSkills: args?.required_skills ? String(args.required_skills) : undefined,
          },
        };
        if (args?.job_id) body.jobId = String(args.job_id);

        const data = (await apiCall("/api/ai/generate-cover-letter-for-job?confirmFreeTrial=true", {
          method: "POST",
          body: JSON.stringify(body),
        })) as { data?: string; message?: string; errorCode?: string };

        if (data.errorCode) {
          return textResult(`Cover letter generation failed: ${data.message || data.errorCode}`);
        }

        return textResult(data.data || "No cover letter generated.");
      }

      case "generate_interview_questions": {
        const body = {
          job: {
            name: String(args?.job_title),
            companyName: args?.company ? String(args.company) : undefined,
            description: args?.description ? String(args.description) : undefined,
            requiredSkills: args?.required_skills ? String(args.required_skills) : undefined,
          },
          interviewType: args?.interview_type || "Technical",
        };

        const data = (await apiCall("/api/ai/generate-interview-questions?confirmFreeTrial=true", {
          method: "POST",
          body: JSON.stringify(body),
        })) as { data?: string[]; message?: string; errorCode?: string };

        if (data.errorCode) {
          return textResult(`Question generation failed: ${data.message || data.errorCode}`);
        }

        const questions = data.data;
        if (!questions || questions.length === 0) {
          return textResult("No interview questions generated.");
        }

        return textResult([
          `🎤 ${args?.interview_type || "Technical"} Interview Questions for ${args?.job_title}`,
          "",
          ...questions.map((q, i) => `${i + 1}. ${q}`),
        ].join("\n"));
      }

      // ======================================================================
      // COFFEE CHAT / NETWORKING
      // ======================================================================
      case "find_coffee_contacts": {
        const params = new URLSearchParams();
        params.append("page", "1");
        params.append("pageSize", String(args?.limit || 10));
        if (args?.search) params.append("searchText", String(args.search));
        if (args?.industry) params.append("industry", String(args.industry));
        if (args?.help_topics && Array.isArray(args.help_topics)) {
          args.help_topics.forEach((topic: string) => params.append("helpTopics", topic));
        }

        const data = (await apiCall(`/api/CoffeeChat/profiles?${params.toString()}`)) as {
          data?: {
            items?: Array<{
              userId: string; displayName: string; headline?: string;
              industry?: string; helpTopics?: string[]; yearsExperience?: number;
              bio?: string;
            }>;
            totalCount?: number;
          };
        };

        const profiles = data.data?.items || [];
        if (profiles.length === 0) {
          return textResult("No coffee chat contacts found matching your criteria.");
        }

        const contactList = profiles
          .map((p, i) => {
            const topics = p.helpTopics?.join(", ") || "General";
            return `${i + 1}. ${p.displayName}\n   ${p.headline || "Professional"}\n   Industry: ${p.industry || "N/A"} | Experience: ${p.yearsExperience || "?"} years\n   Can help with: ${topics}\n   User ID: ${p.userId}`;
          })
          .join("\n\n");

        return textResult(`Found ${data.data?.totalCount || profiles.length} contact(s):\n\n${contactList}`);
      }

      case "send_coffee_chat_request": {
        const body = {
          receiverId: String(args?.receiver_id),
          message: String(args?.message),
        };

        const data = (await apiCall("/api/CoffeeChat/requests", {
          method: "POST",
          body: JSON.stringify(body),
        })) as { message?: string; errorCode?: string };

        return data.errorCode
          ? textResult(`Failed to send request: ${data.message || data.errorCode}`)
          : textResult("Coffee chat request sent successfully! They'll be notified and can accept or decline.");
      }

      case "get_coffee_chat_requests": {
        const direction = String(args?.direction || "sent");
        const data = (await apiCall(`/api/CoffeeChat/requests/${direction}`)) as {
          data?: Array<{
            id: string;
            senderDisplayName?: string;
            receiverDisplayName?: string;
            status: string;
            message: string;
            createdOnUtc: string;
            scheduledDateUtc?: string;
          }>;
        };

        const requests = data.data || [];
        if (requests.length === 0) {
          return textResult(`No ${direction} coffee chat requests found.`);
        }

        const list = requests
          .map((r, i) => {
            const person = direction === "sent" ? r.receiverDisplayName : r.senderDisplayName;
            const scheduled = r.scheduledDateUtc ? `\n   Scheduled: ${new Date(r.scheduledDateUtc).toLocaleString()}` : "";
            return `${i + 1}. ${person || "Unknown"} - ${r.status}\n   Message: ${r.message.substring(0, 80)}...${scheduled}\n   ID: ${r.id}`;
          })
          .join("\n\n");

        return textResult(`${direction === "sent" ? "Sent" : "Received"} requests:\n\n${list}`);
      }

      // ======================================================================
      // NOTIFICATIONS
      // ======================================================================
      case "get_notifications": {
        const limit = args?.limit || 10;
        const data = (await apiCall(`/api/notification?page=1&pageSize=${limit}`)) as {
          data?: {
            items?: Array<{
              id: string; title: string; message: string;
              isRead: boolean; createdOnUtc: string; type?: string;
            }>;
            totalCount?: number;
            unreadCount?: number;
          };
        };

        const notifications = data.data?.items || [];
        if (notifications.length === 0) {
          return textResult("No notifications.");
        }

        const list = notifications
          .map((n, i) => {
            const read = n.isRead ? "  " : "🔴";
            return `${read} ${i + 1}. ${n.title}\n   ${n.message}\n   ${new Date(n.createdOnUtc).toLocaleString()}`;
          })
          .join("\n\n");

        const unread = data.data?.unreadCount;
        return textResult(`Notifications${unread ? ` (${unread} unread)` : ""}:\n\n${list}`);
      }

      case "mark_notifications_read": {
        await apiCall("/api/notification/read-all", { method: "PUT" });
        return textResult("All notifications marked as read.");
      }

      // ======================================================================
      // PROFILE
      // ======================================================================
      case "get_profile": {
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
        if (!p) return textResult("Could not retrieve profile.");

        const skills = p.skills?.map(s => s.name).join(", ") || "None listed";
        const employment = p.employments?.map(e =>
          `  • ${e.title} at ${e.companyName}${e.startDate ? ` (${e.startDate}${e.endDate ? ` - ${e.endDate}` : " - Present"})` : ""}`
        ).join("\n") || "  None listed";
        const education = p.educations?.map(e =>
          `  • ${e.degree}${e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ""} - ${e.institution}`
        ).join("\n") || "  None listed";
        const projects = p.projects?.map(pr =>
          `  • ${pr.name}${pr.description ? `: ${pr.description.substring(0, 80)}` : ""}`
        ).join("\n") || "  None listed";

        return textResult([
          `👤 ${p.firstName || ""} ${p.lastName || ""}`.trim(),
          p.headline ? `${p.headline}` : null,
          p.email ? `Email: ${p.email}` : null,
          p.location ? `Location: ${p.location}` : null,
          p.bio ? `\nBio: ${p.bio}` : null,
          `\nSkills: ${skills}`,
          `\nExperience:\n${employment}`,
          `\nEducation:\n${education}`,
          `\nProjects:\n${projects}`,
        ].filter(Boolean).join("\n"));
      }

      // ======================================================================
      // DEFAULT
      // ======================================================================
      default:
        return textResult(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResult(`Error: ${errorMessage}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("JobJourney MCP server v2.0.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
