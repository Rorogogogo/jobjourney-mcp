import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";
import { SessionAuth } from "../types.js";

export function registerNotificationTools(server: FastMCP<SessionAuth>) {
  server.addTool({
    name: "get_notifications",
    description:
      "Get the user's notifications. Use this when the user asks about updates, alerts, or what's new.",
    parameters: z.object({
      limit: z.number().optional().describe("Maximum number of notifications to return (default: 10)"),
    }),
    execute: async (args, context) => {
      const apiKey = context.session?.apiKey;
      const limit = args.limit || 10;
      const data = (await apiCall(`/api/notification?page=1&pageSize=${limit}`, {}, apiKey)) as {
        items?: Array<{
          id: string; message: string;
          isRead: boolean; createdOnUtc: string; type?: string;
        }>;
        totalCount?: number;
        unreadCount?: number;
      };

      const notifications = data.items || [];
      if (notifications.length === 0) {
        return "No notifications.";
      }

      const list = notifications
        .map((n, i) => {
          const read = n.isRead ? "  " : "[!]";
          return `${read} ${i + 1}. ${n.message}\n   ${new Date(n.createdOnUtc).toLocaleString()}\n   ID: ${n.id}`;
        })
        .join("\n\n");

      const unread = data.unreadCount;
      return `Notifications${unread !== undefined ? ` (${unread} unread)` : ""}:\n\n${list}`;
    },
  });

  server.addTool({
    name: "mark_notifications_read",
    description: "Mark all notifications as read.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const apiKey = context.session?.apiKey;
      await apiCall("/api/notification/read-all", { method: "PUT" }, apiKey);
      return "All notifications marked as read.";
    },
  });

  server.addTool({
    name: "get_unread_notification_count",
    description: "Get the count of unread notifications.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const apiKey = context.session?.apiKey;
      const data = (await apiCall("/api/notification/count", {}, apiKey)) as {
        data?: number;
      };
      return `Unread notifications: ${data.data ?? 0}`;
    },
  });

  server.addTool({
    name: "mark_notification_read",
    description: "Mark a single notification as read.",
    parameters: z.object({
      notification_id: z.string().describe("The notification ID to mark as read"),
    }),
    execute: async (args, context) => {
      const apiKey = context.session?.apiKey;
      await apiCall(`/api/notification/${args.notification_id}/read`, { method: "PUT" }, apiKey);
      return "Notification marked as read.";
    },
  });

  server.addTool({
    name: "delete_notification",
    description: "Delete a notification.",
    parameters: z.object({
      notification_id: z.string().describe("The notification ID to delete"),
    }),
    execute: async (args, context) => {
      const apiKey = context.session?.apiKey;
      await apiCall(`/api/notification/${args.notification_id}`, { method: "DELETE" }, apiKey);
      return "Notification deleted.";
    },
  });
}
