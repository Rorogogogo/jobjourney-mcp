import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";
import { SessionAuth } from "../types.js";

export function registerSubscriptionTools(server: FastMCP<SessionAuth>) {
  server.addTool({
    name: "get_subscription_status",
    description: "Check the user's current subscription status and plan details.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const apiKey = context.session?.apiKey;
      const data = (await apiCall("/api/subscription/status", {}, apiKey)) as {
        errorCode?: string | null; message?: string; isSuccess?: boolean;
      };

      return `Subscription Status: ${data.message || "Unknown"}`;
    },
  });

  server.addTool({
    name: "get_subscription_plans",
    description: "View available subscription plans and pricing.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const apiKey = context.session?.apiKey;
      const data = (await apiCall("/api/subscription/plans", {}, apiKey)) as {
        items?: Array<{
          name: string; price?: number; interval?: string; currency?: string;
          features?: string[]; description?: string;
        }>;
      };

      const plans = data.items || [];
      if (plans.length === 0) return "No subscription plans available.";

      const list = plans.map((plan, i) => {
        const price = plan.price ? `$${plan.price}/${plan.interval || "month"}` : "Free";
        const features = plan.features?.map(f => `    - ${f}`).join("\n") || "";
        return `${i + 1}. ${plan.name} - ${price}${plan.description ? `\n   ${plan.description}` : ""}${features ? `\n${features}` : ""}`;
      }).join("\n\n");

      return `Available Plans:\n\n${list}`;
    },
  });

  server.addTool({
    name: "check_feature_access",
    description: "Check if the user has access to a specific AI feature based on their subscription.",
    parameters: z.object({
      feature_name: z.enum(["CvEvaluation", "CoverLetterGeneration", "JobsAnalysis", "ResumeGeneration", "MockInterview"])
        .describe("The AI feature to check access for"),
    }),
    execute: async (args, context) => {
      const apiKey = context.session?.apiKey;
      const data = (await apiCall(`/api/subscription/check/${args.feature_name}`, {}, apiKey)) as {
        errorCode?: string | null; message?: string; isSuccess?: boolean;
      };

      return data.isSuccess
        ? `You have access to "${args.feature_name}".`
        : `You do not have access to "${args.feature_name}".${data.message ? ` Reason: ${data.message}` : ""}`;
    },
  });

  server.addTool({
    name: "get_payment_history",
    description: "View the user's payment history.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const apiKey = context.session?.apiKey;
      const data = (await apiCall("/api/subscription/payments", {}, apiKey)) as {
        errorCode?: string | null; message?: string; isSuccess?: boolean;
        subscriptionHistory?: Array<{
          id: string; amount: number; status?: string;
          transactionDateOnUtc?: string; description?: string;
        }>;
      };

      if (data.errorCode) {
        return `Unable to retrieve payment history: ${data.message || data.errorCode}`;
      }

      const payments = data.subscriptionHistory || [];
      if (payments.length === 0) return "No payment history found.";

      const list = payments.map((p, i) => {
        const amount = `$${p.amount.toFixed(2)}`;
        const date = p.transactionDateOnUtc ? new Date(p.transactionDateOnUtc).toLocaleDateString() : "Unknown date";
        return `${i + 1}. ${amount} - ${p.status || "unknown"}\n   ${date}${p.description ? `\n   ${p.description}` : ""}`;
      }).join("\n\n");

      return `Payment History:\n\n${list}`;
    },
  });
}
