import { z } from "zod";
import { apiCall } from "../api.js";
export function registerCommentTools(server) {
    server.addTool({
        name: "get_community_comments",
        description: "Browse community posts and comments.",
        parameters: z.object({
            page: z.number().optional().describe("Page number (default: 1)"),
            limit: z.number().optional().describe("Number of comments per page (default: 10)"),
        }),
        execute: async (args) => {
            const page = args.page || 1;
            const limit = args.limit || 10;
            const data = (await apiCall(`/api/comment/community?page=${page}&pageSize=${limit}`));
            const comments = data.data?.items || [];
            if (comments.length === 0)
                return "No community comments found.";
            const list = comments.map((c, i) => {
                const replies = c.replyCount ? ` (${c.replyCount} replies)` : "";
                return `${i + 1}. ${c.authorDisplayName || "Anonymous"}${replies}\n   ${c.content.substring(0, 150)}${c.content.length > 150 ? "..." : ""}\n   ${new Date(c.createdOnUtc).toLocaleString()}\n   ID: ${c.id}`;
            }).join("\n\n");
            return `Community Comments (${data.data?.totalCount || comments.length} total):\n\n${list}`;
        },
    });
    server.addTool({
        name: "get_comment_thread",
        description: "View a comment and its replies.",
        parameters: z.object({
            comment_id: z.string().describe("The comment ID to view the thread for"),
        }),
        execute: async (args) => {
            const data = (await apiCall(`/api/comment/${args.comment_id}/thread`));
            const thread = data.data;
            if (!thread)
                return "Comment thread not found.";
            const replies = thread.replies?.map((r, i) => `  ${i + 1}. ${r.authorDisplayName || "Anonymous"}: ${r.content}\n     ${new Date(r.createdOnUtc).toLocaleString()}`).join("\n\n") || "  No replies";
            return [
                `${thread.authorDisplayName || "Anonymous"}: ${thread.content}`,
                `Posted: ${new Date(thread.createdOnUtc).toLocaleString()}`,
                `\nReplies:\n${replies}`,
            ].join("\n");
        },
    });
    server.addTool({
        name: "create_comment",
        description: "Post a new comment in the community.",
        parameters: z.object({
            content: z.string().describe("The comment content"),
            parent_id: z.string().optional().describe("Parent comment ID if replying to a comment"),
        }),
        execute: async (args) => {
            const body = { content: args.content };
            if (args.parent_id)
                body.parentId = args.parent_id;
            const data = (await apiCall("/api/comment", {
                method: "POST",
                body: JSON.stringify(body),
            }));
            if (data.errorCode) {
                return `Failed to post comment: ${data.message || data.errorCode}`;
            }
            return `Comment posted successfully.${data.data?.id ? `\nComment ID: ${data.data.id}` : ""}`;
        },
    });
    server.addTool({
        name: "update_comment",
        description: "Edit an existing comment.",
        parameters: z.object({
            comment_id: z.string().describe("The comment ID to edit"),
            content: z.string().describe("The updated comment content"),
        }),
        execute: async (args) => {
            await apiCall(`/api/comment/${args.comment_id}`, {
                method: "PUT",
                body: JSON.stringify({ content: args.content }),
            });
            return "Comment updated successfully.";
        },
    });
    server.addTool({
        name: "delete_comment",
        description: "Delete a comment.",
        parameters: z.object({
            comment_id: z.string().describe("The comment ID to delete"),
        }),
        execute: async (args) => {
            await apiCall(`/api/comment/${args.comment_id}`, { method: "DELETE" });
            return "Comment deleted successfully.";
        },
    });
}
