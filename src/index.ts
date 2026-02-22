#!/usr/bin/env node

import { FastMCP } from "fastmcp";
import http from "http";
import { registerJobTools } from "./tools/jobs.js";
import { registerDashboardTools } from "./tools/dashboard.js";
import { registerAiTools } from "./tools/ai.js";
import { registerCoffeeChatTools } from "./tools/coffee-chat.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerSubscriptionTools } from "./tools/subscription.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerCvTools } from "./tools/cv.js";
import { registerChatbotTools } from "./tools/chatbot.js";
import { registerScrapingTools } from "./tools/scraping.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { SessionAuth } from "./types.js";

const transport = (process.env.TRANSPORT || "stdio") as "httpStream" | "stdio";

const server = new FastMCP<SessionAuth>({
  name: "jobjourney-claude-plugin",
  version: "3.1.0",
  ...(transport === "httpStream" && {
    authenticate: async (request: http.IncomingMessage): Promise<SessionAuth> => {
      const auth = request.headers.authorization;
      const xApiKey = request.headers["x-api-key"];

      let apiKey: string | undefined;

      if (auth && auth.startsWith("Bearer ")) {
        apiKey = auth.slice(7).trim();
      } else if (typeof xApiKey === "string") {
        apiKey = xApiKey.trim();
      }

      if (!apiKey) {
        throw new Error("Missing API key. Provide Authorization: Bearer <key> or X-API-Key header.");
      }

      return { apiKey };
    },
  }),
});

registerJobTools(server);
registerDashboardTools(server);
registerAiTools(server);
registerCoffeeChatTools(server);
registerNotificationTools(server);
registerProfileTools(server);
registerDocumentTools(server);
registerSubscriptionTools(server);
registerCommentTools(server);
registerCvTools(server);
registerChatbotTools(server);
registerScrapingTools(server);
registerAnalyticsTools(server);

if (transport === "httpStream") {
  const port = parseInt(process.env.PORT || "8080", 10);
  server.start({
    transportType: "httpStream",
    httpStream: { port },
  });
} else {
  server.start({
    transportType: "stdio",
  });
}
