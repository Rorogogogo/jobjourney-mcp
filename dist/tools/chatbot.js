import { z } from "zod";
import { apiCall } from "../api.js";
export function registerChatbotTools(server) {
    server.addTool({
        name: "chat",
        description: "Send a message to the JobJourney AI chatbot for career advice, job search tips, or general help.",
        parameters: z.object({
            message: z.string().describe("The message to send to the chatbot"),
            conversation_id: z.string().optional().describe("Conversation ID for continuing a chat"),
        }),
        execute: async (args) => {
            const body = { message: args.message };
            if (args.conversation_id)
                body.conversationId = args.conversation_id;
            const data = (await apiCall("/api/chatbot/chat", {
                method: "POST",
                body: JSON.stringify(body),
            }));
            if (data.errorCode) {
                return `Chatbot error: ${data.message || data.errorCode}`;
            }
            const response = data.data?.response || data.data;
            const convId = data.data?.conversationId;
            const responseText = typeof response === "string" ? response : JSON.stringify(response, null, 2);
            return `${responseText}${convId ? `\n\n[Conversation ID: ${convId}]` : ""}`;
        },
    });
}
