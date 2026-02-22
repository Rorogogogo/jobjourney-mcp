import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerCoffeeChatTools(server: FastMCP) {
  server.addTool({
    name: "find_coffee_contacts",
    description:
      "Find people available for coffee chats / networking. Use this when the user wants to connect with professionals, find mentors, or network in a specific industry.",
    parameters: z.object({
      search: z.string().optional().describe("Search by name, title, or bio"),
      industry: z.string().optional().describe("Filter by industry (e.g., 'Technology', 'Finance')"),
      help_topics: z
        .array(z.string())
        .optional()
        .describe("Topics they can help with (e.g., ['resume review', 'interview prep'])"),
      limit: z.number().optional().describe("Maximum number of contacts to return (default: 10)"),
    }),
    execute: async (args) => {
      const params = new URLSearchParams();
      params.append("page", "1");
      params.append("pageSize", String(args.limit || 10));
      if (args.search) params.append("searchText", args.search);
      if (args.industry) params.append("industry", args.industry);
      if (args.help_topics) {
        args.help_topics.forEach((topic) => params.append("helpTopics", topic));
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
        return "No coffee chat contacts found matching your criteria.";
      }

      const contactList = profiles
        .map((p, i) => {
          const topics = p.helpTopics?.join(", ") || "General";
          return `${i + 1}. ${p.displayName}\n   ${p.headline || "Professional"}\n   Industry: ${p.industry || "N/A"} | Experience: ${p.yearsExperience || "?"} years\n   Can help with: ${topics}\n   User ID: ${p.userId}`;
        })
        .join("\n\n");

      return `Found ${data.data?.totalCount || profiles.length} contact(s):\n\n${contactList}`;
    },
  });

  server.addTool({
    name: "send_coffee_chat_request",
    description:
      "Send a coffee chat request to a user. Use this after finding contacts with find_coffee_contacts.",
    parameters: z.object({
      receiver_id: z.string().describe("The user ID of the person to send the request to"),
      message: z.string().describe("A personalized message (20-500 characters) explaining why you'd like to chat"),
    }),
    execute: async (args) => {
      const data = (await apiCall("/api/CoffeeChat/requests", {
        method: "POST",
        body: JSON.stringify({ receiverId: args.receiver_id, message: args.message }),
      })) as { message?: string; errorCode?: string };

      return data.errorCode
        ? `Failed to send request: ${data.message || data.errorCode}`
        : "Coffee chat request sent successfully! They'll be notified and can accept or decline.";
    },
  });

  server.addTool({
    name: "get_coffee_chat_requests",
    description: "Get the user's coffee chat requests - either sent or received.",
    parameters: z.object({
      direction: z
        .enum(["sent", "received"])
        .optional()
        .describe("Whether to get sent or received requests (default: sent)"),
    }),
    execute: async (args) => {
      const direction = args.direction || "sent";
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
        return `No ${direction} coffee chat requests found.`;
      }

      const list = requests
        .map((r, i) => {
          const person = direction === "sent" ? r.receiverDisplayName : r.senderDisplayName;
          const scheduled = r.scheduledDateUtc ? `\n   Scheduled: ${new Date(r.scheduledDateUtc).toLocaleString()}` : "";
          return `${i + 1}. ${person || "Unknown"} - ${r.status}\n   Message: ${r.message.substring(0, 80)}...${scheduled}\n   ID: ${r.id}`;
        })
        .join("\n\n");

      return `${direction === "sent" ? "Sent" : "Received"} requests:\n\n${list}`;
    },
  });

  server.addTool({
    name: "get_my_coffee_profile",
    description: "Get the user's own coffee chat profile.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/coffeechat/my-profile")) as {
        data?: {
          displayName?: string; headline?: string; bio?: string;
          industry?: string; helpTopics?: string[]; yearsExperience?: number;
          isAvailable?: boolean;
        };
        message?: string;
        errorCode?: string;
      };

      if (data.errorCode) {
        return "No coffee chat profile found. Use update_coffee_profile to create one.";
      }

      const p = data.data;
      if (!p) return "No coffee chat profile found.";

      return [
        `Coffee Chat Profile`,
        `Name: ${p.displayName || "N/A"}`,
        p.headline ? `Headline: ${p.headline}` : null,
        p.bio ? `Bio: ${p.bio}` : null,
        p.industry ? `Industry: ${p.industry}` : null,
        p.helpTopics?.length ? `Help Topics: ${p.helpTopics.join(", ")}` : null,
        p.yearsExperience ? `Experience: ${p.yearsExperience} years` : null,
        `Available: ${p.isAvailable !== false ? "Yes" : "No"}`,
      ].filter(Boolean).join("\n");
    },
  });

  server.addTool({
    name: "update_coffee_profile",
    description: "Create or update the user's coffee chat profile to make themselves available for networking.",
    parameters: z.object({
      headline: z.string().optional().describe("Professional headline"),
      bio: z.string().optional().describe("Short bio about yourself"),
      industry: z.string().optional().describe("Your industry (e.g., 'Technology', 'Finance')"),
      help_topics: z
        .array(z.string())
        .optional()
        .describe("Topics you can help with (e.g., ['resume review', 'career advice'])"),
      years_experience: z.number().optional().describe("Years of professional experience"),
      is_available: z.boolean().optional().describe("Whether you're available for coffee chats (default: true)"),
    }),
    execute: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.headline) body.headline = args.headline;
      if (args.bio) body.bio = args.bio;
      if (args.industry) body.industry = args.industry;
      if (args.help_topics) body.helpTopics = args.help_topics;
      if (args.years_experience !== undefined) body.yearsExperience = args.years_experience;
      if (args.is_available !== undefined) body.isAvailable = args.is_available;

      const data = (await apiCall("/api/coffeechat/my-profile", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { message?: string; errorCode?: string };

      return data.errorCode
        ? `Failed to update coffee profile: ${data.message || data.errorCode}`
        : "Coffee chat profile updated successfully.";
    },
  });

  server.addTool({
    name: "delete_coffee_profile",
    description: "Delete the user's coffee chat profile, removing them from the networking pool.",
    parameters: z.object({}),
    execute: async () => {
      await apiCall("/api/coffeechat/my-profile", { method: "DELETE" });
      return "Coffee chat profile deleted successfully.";
    },
  });

  server.addTool({
    name: "respond_coffee_chat",
    description: "Accept or decline a received coffee chat request.",
    parameters: z.object({
      request_id: z.string().describe("The coffee chat request ID"),
      action: z.enum(["accept", "decline"]).describe("Whether to accept or decline the request"),
    }),
    execute: async (args) => {
      await apiCall(`/api/coffeechat/requests/${args.request_id}`, {
        method: "PUT",
        body: JSON.stringify({ action: args.action }),
      });

      return `Coffee chat request ${args.action === "accept" ? "accepted" : "declined"} successfully.`;
    },
  });

  server.addTool({
    name: "get_coffee_chat_messages",
    description: "Get messages in a coffee chat conversation.",
    parameters: z.object({
      request_id: z.string().describe("The coffee chat request ID"),
    }),
    execute: async (args) => {
      const data = (await apiCall(`/api/coffeechat/requests/${args.request_id}/messages`)) as {
        data?: Array<{
          id: string; content: string; senderDisplayName?: string;
          createdOnUtc: string;
        }>;
      };

      const messages = data.data || [];
      if (messages.length === 0) {
        return "No messages in this conversation yet.";
      }

      const list = messages
        .map((m) => `[${new Date(m.createdOnUtc).toLocaleString()}] ${m.senderDisplayName || "Unknown"}: ${m.content}`)
        .join("\n");

      return `Chat messages:\n\n${list}`;
    },
  });

  server.addTool({
    name: "send_coffee_chat_message",
    description: "Send a message in a coffee chat conversation.",
    parameters: z.object({
      request_id: z.string().describe("The coffee chat request ID"),
      content: z.string().describe("The message content"),
    }),
    execute: async (args) => {
      await apiCall(`/api/coffeechat/requests/${args.request_id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: args.content }),
      });
      return "Message sent successfully.";
    },
  });

  server.addTool({
    name: "get_coffee_chat_stats",
    description: "Get coffee chat statistics (requests sent, received, accepted, etc.).",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/coffeechat/stats")) as {
        data?: {
          totalSent?: number; totalReceived?: number; accepted?: number;
          declined?: number; pending?: number;
        };
      };

      const s = data.data;
      if (!s) return "Could not retrieve coffee chat statistics.";

      return [
        "Coffee Chat Statistics",
        `Sent: ${s.totalSent ?? 0}`,
        `Received: ${s.totalReceived ?? 0}`,
        `Accepted: ${s.accepted ?? 0}`,
        `Declined: ${s.declined ?? 0}`,
        `Pending: ${s.pending ?? 0}`,
      ].join("\n");
    },
  });
}
