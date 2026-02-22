import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerDocumentTools(server: FastMCP) {
  server.addTool({
    name: "get_documents",
    description: "List all user documents (CVs and cover letters).",
    parameters: z.object({
      type: z
        .enum(["cvs", "cover-letters", "all"])
        .optional()
        .describe("Type of documents to list (default: all)"),
    }),
    execute: async (args) => {
      const docType = args.type || "all";
      const results: string[] = [];

      if (docType === "all" || docType === "cvs") {
        const cvData = (await apiCall("/api/document/cvs")) as {
          data?: Array<{ id: string; name: string; createdOnUtc: string }>;
        };
        const cvs = cvData.data || [];
        if (cvs.length > 0) {
          results.push("CVs:");
          cvs.forEach((cv, i) => {
            results.push(`  ${i + 1}. ${cv.name} (${new Date(cv.createdOnUtc).toLocaleDateString()})\n     ID: ${cv.id}`);
          });
        } else {
          results.push("CVs: None");
        }
      }

      if (docType === "all" || docType === "cover-letters") {
        const clData = (await apiCall("/api/document/cover-letters")) as {
          data?: Array<{ id: string; name: string; createdOnUtc: string }>;
        };
        const cls = clData.data || [];
        if (cls.length > 0) {
          results.push("\nCover Letters:");
          cls.forEach((cl, i) => {
            results.push(`  ${i + 1}. ${cl.name} (${new Date(cl.createdOnUtc).toLocaleDateString()})\n     ID: ${cl.id}`);
          });
        } else {
          results.push("\nCover Letters: None");
        }
      }

      return results.join("\n");
    },
  });

  server.addTool({
    name: "get_document",
    description: "Get details of a specific document by ID.",
    parameters: z.object({
      document_id: z.string().describe("The document ID"),
    }),
    execute: async (args) => {
      const data = (await apiCall(`/api/document/${args.document_id}`)) as {
        data?: {
          id: string; name: string; content?: string; type?: string;
          createdOnUtc: string; updatedOnUtc?: string;
        };
      };

      const doc = data.data;
      if (!doc) return "Document not found.";

      return [
        `Document: ${doc.name}`,
        doc.type ? `Type: ${doc.type}` : null,
        `Created: ${new Date(doc.createdOnUtc).toLocaleDateString()}`,
        doc.updatedOnUtc ? `Updated: ${new Date(doc.updatedOnUtc).toLocaleDateString()}` : null,
        doc.content ? `\nContent:\n${doc.content}` : null,
        `ID: ${doc.id}`,
      ].filter(Boolean).join("\n");
    },
  });

  server.addTool({
    name: "delete_document",
    description: "Delete a document (CV or cover letter).",
    parameters: z.object({
      document_id: z.string().describe("The document ID to delete"),
      type: z.enum(["cv", "cover-letter"]).describe("Type of document to delete"),
    }),
    execute: async (args) => {
      await apiCall(`/api/document/${args.type}/${args.document_id}`, { method: "DELETE" });
      return "Document deleted successfully.";
    },
  });

  server.addTool({
    name: "rename_document",
    description: "Rename a document.",
    parameters: z.object({
      document_id: z.string().describe("The document ID to rename"),
      name: z.string().describe("The new name for the document"),
    }),
    execute: async (args) => {
      await apiCall(`/api/document/rename/${args.document_id}`, {
        method: "PUT",
        body: JSON.stringify({ name: args.name }),
      });
      return `Document renamed to "${args.name}" successfully.`;
    },
  });
}
