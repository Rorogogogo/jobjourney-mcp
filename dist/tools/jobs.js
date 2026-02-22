import { z } from "zod";
import { apiCall, API_BASE_URL, API_KEY } from "../api.js";
import { JOB_STATUS, STATUS_TEXT, STATUS_MAP } from "../constants.js";
export function registerJobTools(server) {
    server.addTool({
        name: "save_job",
        description: "Save a new job application to track. Use this when the user wants to save or add a job they're interested in or have applied to.",
        parameters: z.object({
            title: z.string().describe("Job title (e.g., 'Software Engineer')"),
            company: z.string().describe("Company name"),
            location: z.string().optional().describe("Job location"),
            job_url: z.string().optional().describe("URL to the job posting"),
            description: z.string().optional().describe("Job description"),
            required_skills: z.string().optional().describe("Required skills"),
            status: z
                .enum(["saved", "applied", "initial_interview", "final_interview", "offered", "rejected"])
                .optional()
                .describe("Current application status (default: saved)"),
            is_starred: z.boolean().optional().describe("Mark as important/starred (default: false)"),
        }),
        execute: async (args) => {
            const formData = new FormData();
            formData.append("Name", args.title);
            formData.append("CompanyName", args.company);
            if (args.location)
                formData.append("Location", args.location);
            const jobUrl = args.job_url || `https://jobjourney.me/manual/${Date.now()}`;
            formData.append("JobUrl", jobUrl);
            if (args.description)
                formData.append("Description", args.description);
            if (args.required_skills)
                formData.append("RequiredSkills", args.required_skills);
            formData.append("Status", String(STATUS_MAP[args.status || "saved"] || JOB_STATUS.SAVED));
            formData.append("IsStarred", String(args.is_starred || false));
            const result = await fetch(`${API_BASE_URL}/api/Job/manually-save`, {
                method: "POST",
                headers: { ...(API_KEY && { "X-API-Key": API_KEY }) },
                body: formData,
            });
            const data = await result.json();
            return data.isSuccess !== false
                ? `Job saved successfully!\n\nTitle: ${args.title}\nCompany: ${args.company}\nStatus: ${args.status || "saved"}${data.data?.id ? `\nID: ${data.data.id}` : ""}`
                : `Failed to save job: ${data.message || "Unknown error"}`;
        },
    });
    server.addTool({
        name: "get_jobs",
        description: "Get the user's saved jobs with their current status. Use this to check job application status, list all jobs, or find specific jobs.",
        parameters: z.object({
            search: z.string().optional().describe("Search by job title or company name"),
            status: z
                .enum(["saved", "applied", "initial_interview", "final_interview", "offered", "rejected", "expired"])
                .optional()
                .describe("Filter by status"),
            starred_only: z.boolean().optional().describe("Only show starred jobs"),
            limit: z.number().optional().describe("Maximum number of jobs to return (default: 10)"),
        }),
        execute: async (args) => {
            const params = new URLSearchParams();
            params.append("pageNumber", "1");
            params.append("pageSize", String(args.limit || 10));
            if (args.search)
                params.append("searchText", args.search);
            if (args.status)
                params.append("status", String(STATUS_MAP[args.status]));
            if (args.starred_only)
                params.append("isStarred", "true");
            const data = (await apiCall(`/api/Job?${params.toString()}`));
            if (!data.items || data.items.length === 0) {
                return "No jobs found matching your criteria.";
            }
            const jobList = data.items
                .map((job, i) => {
                const status = STATUS_TEXT[parseInt(job.status)] || job.status;
                const star = job.isStarred ? " ⭐" : "";
                const loc = job.location ? `\n   Location: ${job.location}` : "";
                return `${i + 1}. ${job.name} at ${job.companyName}${star}\n   Status: ${status}${loc}\n   ID: ${job.id}`;
            })
                .join("\n\n");
            return `Found ${data.totalCount} job(s):\n\n${jobList}`;
        },
    });
    server.addTool({
        name: "get_job_details",
        description: "Get full details of a specific job by ID, including description, skills, notes, and evaluation data.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to get details for"),
        }),
        execute: async (args) => {
            const data = (await apiCall(`/api/Job/${args.job_id}`));
            const job = data.data;
            if (!job)
                return "Job not found.";
            const status = STATUS_TEXT[parseInt(job.status)] || job.status;
            const notes = job.notes?.map((n, i) => `  ${i + 1}. ${n.content} (${new Date(n.createdOnUtc).toLocaleDateString()})`).join("\n") || "  None";
            return [
                `${job.name} at ${job.companyName}${job.isStarred ? " ⭐" : ""}`,
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
            ].filter(Boolean).join("\n");
        },
    });
    server.addTool({
        name: "update_job_status",
        description: "Update the status of a job application. Use this when the user's application progresses (got an interview, received offer, was rejected, etc.)",
        parameters: z.object({
            job_id: z.string().describe("The job ID to update"),
            status: z
                .enum(["saved", "applied", "initial_interview", "final_interview", "offered", "rejected", "expired"])
                .describe("New status for the job"),
        }),
        execute: async (args) => {
            const newStatus = STATUS_MAP[args.status];
            if (newStatus === undefined) {
                return `Invalid status: ${args.status}. Valid options: saved, applied, initial_interview, final_interview, offered, rejected, expired`;
            }
            await apiCall(`/api/Job/${args.job_id}/status/${newStatus}`, { method: "PUT" });
            return `Job status updated to: ${STATUS_TEXT[newStatus]}`;
        },
    });
    server.addTool({
        name: "delete_job",
        description: "Delete a saved job. Use this when the user wants to remove a job from their list.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to delete"),
        }),
        execute: async (args) => {
            await apiCall(`/api/Job/${args.job_id}`, { method: "DELETE" });
            return "Job deleted successfully.";
        },
    });
    server.addTool({
        name: "star_job",
        description: "Star or unstar a job to mark it as important.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to star/unstar"),
            is_starred: z.boolean().describe("true to star, false to unstar"),
        }),
        execute: async (args) => {
            await apiCall(`/api/Job/${args.job_id}/star`, {
                method: "PUT",
                body: JSON.stringify({ isStarred: args.is_starred }),
            });
            return `Job ${args.is_starred ? "starred ⭐" : "unstarred"} successfully.`;
        },
    });
    server.addTool({
        name: "add_job_note",
        description: "Add a note to a job application. Use this when the user wants to record information about a job (e.g., interviewer name, follow-up date, salary info).",
        parameters: z.object({
            job_id: z.string().describe("The job ID to add a note to"),
            content: z.string().describe("The note content"),
        }),
        execute: async (args) => {
            const data = (await apiCall(`/api/Job/${args.job_id}/notes`, {
                method: "POST",
                body: JSON.stringify({ content: args.content }),
            }));
            return `Note added to job successfully.${data.data?.id ? `\nNote ID: ${data.data.id}` : ""}`;
        },
    });
    server.addTool({
        name: "update_job_note",
        description: "Update an existing note on a job application.",
        parameters: z.object({
            job_id: z.string().describe("The job ID the note belongs to"),
            note_id: z.string().describe("The note ID to update"),
            content: z.string().describe("The updated note content"),
        }),
        execute: async (args) => {
            await apiCall(`/api/Job/${args.job_id}/notes/${args.note_id}`, {
                method: "PUT",
                body: JSON.stringify({ content: args.content }),
            });
            return "Note updated successfully.";
        },
    });
    server.addTool({
        name: "delete_job_note",
        description: "Delete a note from a job application.",
        parameters: z.object({
            job_id: z.string().describe("The job ID the note belongs to"),
            note_id: z.string().describe("The note ID to delete"),
        }),
        execute: async (args) => {
            await apiCall(`/api/Job/${args.job_id}/notes/${args.note_id}`, { method: "DELETE" });
            return "Note deleted successfully.";
        },
    });
    server.addTool({
        name: "get_job_evaluation",
        description: "Get the saved CV/resume evaluation for a specific job.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to get evaluation for"),
        }),
        execute: async (args) => {
            const data = (await apiCall(`/api/Job/${args.job_id}/cv-evaluation`));
            const eval_ = data.data;
            if (!eval_)
                return "No evaluation found for this job.";
            return [
                `Job Fit Evaluation`,
                `Score: ${eval_.overallScore ?? "N/A"}/100`,
                "",
                eval_.summary ? `Summary: ${eval_.summary}` : null,
                eval_.strengths?.length ? `\nStrengths:\n${eval_.strengths.map(s => `  - ${s}`).join("\n")}` : null,
                eval_.weaknesses?.length ? `\nWeaknesses:\n${eval_.weaknesses.map(w => `  - ${w}`).join("\n")}` : null,
                eval_.recommendations?.length ? `\nRecommendations:\n${eval_.recommendations.map(r => `  - ${r}`).join("\n")}` : null,
            ].filter(Boolean).join("\n");
        },
    });
    server.addTool({
        name: "get_job_cover_letter",
        description: "Get the saved cover letter for a specific job.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to get cover letter for"),
        }),
        execute: async (args) => {
            const data = (await apiCall(`/api/Job/${args.job_id}/cover-letter`));
            if (!data.data)
                return "No cover letter found for this job.";
            return data.data;
        },
    });
    server.addTool({
        name: "bulk_update_jobs",
        description: "Perform bulk operations on multiple jobs at once: delete, reject, or advance to next stage.",
        parameters: z.object({
            job_ids: z.array(z.string()).describe("Array of job IDs to update"),
            action: z
                .enum(["delete", "reject", "proceed"])
                .describe("Action to perform: delete (remove), reject (mark as not a fit), proceed (advance to next stage)"),
        }),
        execute: async (args) => {
            const actionMap = {
                delete: "/api/bulk-job/delete",
                reject: "/api/bulk-job/reject",
                proceed: "/api/bulk-job/proceed",
            };
            const endpoint = actionMap[args.action];
            if (!endpoint)
                return "Invalid action. Use: delete, reject, or proceed.";
            await apiCall(endpoint, {
                method: "POST",
                body: JSON.stringify({ jobIds: args.job_ids }),
            });
            const actionText = {
                delete: "deleted",
                reject: "marked as rejected",
                proceed: "advanced to next stage",
            };
            return `${args.job_ids.length} job(s) ${actionText[args.action]} successfully.`;
        },
    });
}
