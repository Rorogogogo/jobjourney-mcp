import { z } from "zod";
import { apiCall } from "../api.js";
export function registerAiTools(server) {
    server.addTool({
        name: "evaluate_job_fit",
        description: "Use AI to evaluate how well the user's profile/resume matches a specific job. Returns a fit score and detailed analysis.",
        parameters: z.object({
            job_title: z.string().describe("Job title"),
            company: z.string().optional().describe("Company name"),
            description: z.string().describe("Job description"),
            required_skills: z.string().optional().describe("Required skills for the job"),
            job_id: z.string().optional().describe("Existing job ID to evaluate against (if job is already saved)"),
        }),
        execute: async (args) => {
            const jobObj = {
                name: args.job_title,
                companyName: args.company,
                description: args.description,
                requiredSkills: args.required_skills,
            };
            if (args.job_id)
                jobObj.id = args.job_id;
            const data = (await apiCall("/api/ai/evaluate-job-fit?confirmFreeTrial=true", {
                method: "POST",
                body: JSON.stringify({ job: jobObj }),
            }));
            if (data.errorCode) {
                return `Evaluation failed: ${data.message || data.errorCode}`;
            }
            const eval_ = data.data;
            if (!eval_)
                return "No evaluation data returned.";
            return [
                `Job Fit Evaluation: ${args.job_title}${args.company ? ` at ${args.company}` : ""}`,
                `Score: ${eval_.overallScore ?? "N/A"}/100`,
                "",
                eval_.summary ? `Summary: ${eval_.summary}` : null,
                eval_.strengths?.length ? `\nStrengths:\n${eval_.strengths.map(s => `  + ${s}`).join("\n")}` : null,
                eval_.weaknesses?.length ? `\nWeaknesses:\n${eval_.weaknesses.map(w => `  - ${w}`).join("\n")}` : null,
                eval_.recommendations?.length ? `\nRecommendations:\n${eval_.recommendations.map(r => `  * ${r}`).join("\n")}` : null,
            ].filter(Boolean).join("\n");
        },
    });
    server.addTool({
        name: "generate_cover_letter",
        description: "Use AI to generate a tailored cover letter for a specific job based on the user's profile/resume.",
        parameters: z.object({
            job_title: z.string().describe("Job title"),
            company: z.string().optional().describe("Company name"),
            description: z.string().describe("Job description"),
            required_skills: z.string().optional().describe("Required skills"),
            job_id: z.string().optional().describe("Existing job ID (to save the cover letter to the job)"),
        }),
        execute: async (args) => {
            const body = {
                job: {
                    name: args.job_title,
                    companyName: args.company,
                    description: args.description,
                    requiredSkills: args.required_skills,
                },
            };
            if (args.job_id)
                body.jobId = args.job_id;
            const data = (await apiCall("/api/ai/generate-cover-letter-for-job?confirmFreeTrial=true", {
                method: "POST",
                body: JSON.stringify(body),
            }));
            if (data.errorCode) {
                return `Cover letter generation failed: ${data.message || data.errorCode}`;
            }
            return data.data || "No cover letter generated.";
        },
    });
    server.addTool({
        name: "generate_interview_questions",
        description: "Use AI to generate practice interview questions for a specific job. Choose between technical or behavioral questions.",
        parameters: z.object({
            job_title: z.string().describe("Job title"),
            company: z.string().optional().describe("Company name"),
            description: z.string().optional().describe("Job description"),
            required_skills: z.string().optional().describe("Required skills"),
            interview_type: z
                .enum(["Technical", "Behavioral"])
                .optional()
                .describe("Type of interview questions (default: Technical)"),
        }),
        execute: async (args) => {
            const body = {
                job: {
                    name: args.job_title,
                    companyName: args.company,
                    description: args.description,
                    requiredSkills: args.required_skills,
                },
                interviewType: args.interview_type || "Technical",
            };
            const data = (await apiCall("/api/ai/generate-interview-questions?confirmFreeTrial=true", {
                method: "POST",
                body: JSON.stringify(body),
            }));
            if (data.errorCode) {
                return `Question generation failed: ${data.message || data.errorCode}`;
            }
            const questions = data.data;
            if (!questions || questions.length === 0) {
                return "No interview questions generated.";
            }
            return [
                `${args.interview_type || "Technical"} Interview Questions for ${args.job_title}`,
                "",
                ...questions.map((q, i) => `${i + 1}. ${q}`),
            ].join("\n");
        },
    });
    server.addTool({
        name: "conduct_mock_interview",
        description: "Conduct an AI-powered mock interview for a specific job. Simulates a real interview experience.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to conduct a mock interview for"),
            interview_type: z
                .enum(["Technical", "Behavioral"])
                .optional()
                .describe("Type of interview (default: Technical)"),
        }),
        execute: async (args) => {
            const body = {
                jobId: args.job_id,
                interviewType: args.interview_type || "Technical",
            };
            const data = (await apiCall("/api/ai/conduct-mock-interview?confirmFreeTrial=true", {
                method: "POST",
                body: JSON.stringify(body),
            }));
            if (data.errorCode) {
                return `Mock interview failed: ${data.message || data.errorCode}`;
            }
            return typeof data.data === "string" ? data.data : JSON.stringify(data.data, null, 2);
        },
    });
    server.addTool({
        name: "get_mock_interview_report",
        description: "Get the mock interview report for a specific job.",
        parameters: z.object({
            job_id: z.string().describe("The job ID to get the mock interview report for"),
        }),
        execute: async (args) => {
            const data = (await apiCall(`/api/ai/get-mock-interview-report/${args.job_id}`));
            if (data.errorCode) {
                return `Failed to get report: ${data.message || data.errorCode}`;
            }
            if (!data.data)
                return "No mock interview report found for this job.";
            return typeof data.data === "string" ? data.data : JSON.stringify(data.data, null, 2);
        },
    });
    server.addTool({
        name: "generate_coffee_chat_suggestions",
        description: "Use AI to generate personalized coffee chat introduction messages based on a person's profile.",
        parameters: z.object({
            receiver_id: z.string().describe("The user ID of the person you want to chat with"),
        }),
        execute: async (args) => {
            const data = (await apiCall("/api/ai/generate-coffee-chat-suggestions?confirmFreeTrial=true", {
                method: "POST",
                body: JSON.stringify({ receiverId: args.receiver_id }),
            }));
            if (data.errorCode) {
                return `Failed to generate suggestions: ${data.message || data.errorCode}`;
            }
            if (!data.data)
                return "No suggestions generated.";
            if (Array.isArray(data.data)) {
                return [
                    "Coffee Chat Introduction Suggestions:",
                    "",
                    ...data.data.map((s, i) => `${i + 1}. ${s}`),
                ].join("\n");
            }
            return String(data.data);
        },
    });
}
