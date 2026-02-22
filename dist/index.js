#!/usr/bin/env node
import { FastMCP } from "fastmcp";
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
const server = new FastMCP({
    name: "jobjourney-claude-plugin",
    version: "3.1.0",
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
server.start({
    transportType: "stdio",
});
