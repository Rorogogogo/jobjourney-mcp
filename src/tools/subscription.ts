import { FastMCP } from "fastmcp";
import { z } from "zod";
import { apiCall } from "../api.js";

export function registerSubscriptionTools(server: FastMCP) {
  server.addTool({
    name: "get_subscription_status",
    description: "Check the user's current subscription status and plan details.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/subscription/status")) as {
        data?: {
          plan?: string; status?: string; currentPeriodEnd?: string;
          features?: string[]; trialEnd?: string;
        };
      };

      const sub = data.data;
      if (!sub) return "Could not retrieve subscription status.";

      return [
        "Subscription Status",
        `Plan: ${sub.plan || "Free"}`,
        `Status: ${sub.status || "Active"}`,
        sub.currentPeriodEnd ? `Renews: ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : null,
        sub.trialEnd ? `Trial ends: ${new Date(sub.trialEnd).toLocaleDateString()}` : null,
        sub.features?.length ? `\nFeatures: ${sub.features.join(", ")}` : null,
      ].filter(Boolean).join("\n");
    },
  });

  server.addTool({
    name: "get_subscription_plans",
    description: "View available subscription plans and pricing.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/subscription/plans")) as {
        data?: Array<{
          name: string; price?: number; interval?: string;
          features?: string[]; description?: string;
        }>;
      };

      const plans = data.data || [];
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
    description: "Check if the user has access to a specific feature based on their subscription.",
    parameters: z.object({
      feature_name: z.string().describe("The feature name to check access for"),
    }),
    execute: async (args) => {
      const data = (await apiCall(`/api/subscription/check/${args.feature_name}`)) as {
        data?: { hasAccess?: boolean; reason?: string };
      };

      const access = data.data;
      if (!access) return "Could not check feature access.";

      return access.hasAccess
        ? `You have access to "${args.feature_name}".`
        : `You do not have access to "${args.feature_name}".${access.reason ? ` Reason: ${access.reason}` : ""}`;
    },
  });

  server.addTool({
    name: "get_payment_history",
    description: "View the user's payment history.",
    parameters: z.object({}),
    execute: async () => {
      const data = (await apiCall("/api/subscription/payments")) as {
        data?: Array<{
          amount: number; currency?: string; status: string;
          createdOnUtc: string; description?: string;
        }>;
      };

      const payments = data.data || [];
      if (payments.length === 0) return "No payment history found.";

      const list = payments.map((p, i) => {
        const amount = `$${(p.amount / 100).toFixed(2)} ${(p.currency || "USD").toUpperCase()}`;
        return `${i + 1}. ${amount} - ${p.status}\n   ${new Date(p.createdOnUtc).toLocaleDateString()}${p.description ? `\n   ${p.description}` : ""}`;
      }).join("\n\n");

      return `Payment History:\n\n${list}`;
    },
  });
}
