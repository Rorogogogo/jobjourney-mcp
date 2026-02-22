import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerCvTools(server: FastMCP) {
  server.addTool({
    name: "generate_cv",
    description: "Generate a CV/resume as PDF using AI based on the user's profile.",
    parameters: z.object({
      template: z.string().optional().describe("CV template to use"),
      job_title: z.string().optional().describe("Target job title to tailor the CV for"),
      job_description: z.string().optional().describe("Job description to tailor the CV for"),
    }),
    execute: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.template) body.template = args.template;
      if (args.job_title) body.jobTitle = args.job_title;
      if (args.job_description) body.jobDescription = args.job_description;

      const data = (await apiCall("/api/cv/generate", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { data?: unknown; message?: string; errorCode?: string };

      if (data.errorCode) {
        return `CV generation failed: ${data.message || data.errorCode}`;
      }

      return typeof data.data === "string"
        ? `CV generated successfully.\n\n${data.data}`
        : "CV generated successfully. Check your documents for the result.";
    },
  });

  server.addTool({
    name: "generate_and_store_cv",
    description: "Generate a CV and save it to the user's documents.",
    parameters: z.object({
      template: z.string().optional().describe("CV template to use"),
      job_title: z.string().optional().describe("Target job title to tailor the CV for"),
      job_description: z.string().optional().describe("Job description to tailor the CV for"),
      name: z.string().optional().describe("Name for the saved document"),
    }),
    execute: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.template) body.template = args.template;
      if (args.job_title) body.jobTitle = args.job_title;
      if (args.job_description) body.jobDescription = args.job_description;
      if (args.name) body.name = args.name;

      const data = (await apiCall("/api/cv/generate-and-store", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { data?: { id?: string; name?: string }; message?: string; errorCode?: string };

      if (data.errorCode) {
        return `CV generation failed: ${data.message || data.errorCode}`;
      }

      return `CV generated and saved successfully.${data.data?.id ? `\nDocument ID: ${data.data.id}` : ""}${data.data?.name ? `\nName: ${data.data.name}` : ""}`;
    },
  });
}
