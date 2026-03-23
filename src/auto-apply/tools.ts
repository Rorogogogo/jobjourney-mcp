import { FastMCP } from "fastmcp";
import { z } from "zod";
import { type SessionAuth } from "../types.js";
import { apiCall } from "../api.js";
import { openPage, requireActivePage, closeBrowserSession, getActiveBrowser, isBrowserDead } from "./browser-session.js";
import { resolveApplyUrl, detectAggregator } from "./resolve-apply-url.js";
import { extractFormFields } from "./dom-extractor.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function registerAutoApplyTools(server: FastMCP<SessionAuth>): void {

  // ── open_application_page ────────────────────────────────────
  server.addTool({
    name: "open_application_page",
    description:
      "Open a job application page in the browser. Detects aggregator sites (LinkedIn/Seek/Indeed) and resolves to the real application URL. Keeps the browser open for subsequent form-filling tool calls.",
    parameters: z.object({
      url: z.string().url().describe("The job listing or application URL"),
    }),
    execute: async (args) => {
      const { page: browserPage, resolvedUrl: initialUrl } = await openPage(args.url);
      let resolvedUrl = initialUrl;

      if (detectAggregator(args.url) !== "none") {
        try {
          const browser = getActiveBrowser();
          if (browser) {
            const atsUrl = await resolveApplyUrl(args.url, browser);
            if (atsUrl !== args.url) {
              await browserPage.goto(atsUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
              await browserPage.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
              resolvedUrl = browserPage.url();
            }
          }
        } catch {
          // Fall through — use the page as-is
        }
      }

      const pageTitle = await browserPage.title();
      return JSON.stringify({ resolvedUrl, pageTitle });
    },
  });

  // ── extract_form_fields ──────────────────────────────────────
  server.addTool({
    name: "extract_form_fields",
    description:
      "Extract all visible form fields from the current page. Returns structured data for each field including label, type, options, and a CSS selector for filling. Call open_application_page first.",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();
      const result = await extractFormFields(page);
      return JSON.stringify(result, null, 2);
    },
  });

  // ── fill_form_field ──────────────────────────────────────────
  server.addTool({
    name: "fill_form_field",
    description:
      "Fill a single text input or textarea field on the current page. Use the selector from extract_form_fields.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the field"),
      value: z.string().describe("Value to fill"),
    }),
    execute: async (args) => {
      const page = requireActivePage();
      const el = page.locator(args.selector).first();

      // Try fill() first
      await el.fill(args.value, { timeout: 5_000 });

      // Verify value stuck (React/Angular controlled inputs)
      const actual = await el.inputValue({ timeout: 2_000 }).catch(() => "");
      if (actual !== args.value) {
        // Fallback: clear + type
        await el.click({ timeout: 3_000 });
        await el.fill("", { timeout: 2_000 });
        await page.keyboard.type(args.value, { delay: 20 });
      }

      const filledValue = await el.inputValue({ timeout: 2_000 }).catch(() => args.value);
      return JSON.stringify({ success: true, filledValue });
    },
  });

  // ── select_form_option ───────────────────────────────────────
  server.addTool({
    name: "select_form_option",
    description:
      "Select an option in a dropdown, radio group, or checkbox. Tries matching by label text first, then by value.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the select/radio/checkbox element"),
      value: z.string().describe("Option label or value to select"),
    }),
    execute: async (args) => {
      const page = requireActivePage();
      const el = page.locator(args.selector).first();
      const tagName = await el.evaluate((e: Element) => e.tagName).catch(() => "");

      if (tagName === "SELECT") {
        await el
          .selectOption({ label: args.value }, { timeout: 5_000 })
          .catch(async () => {
            return el.selectOption({ value: args.value }, { timeout: 5_000 });
          });
        return JSON.stringify({ success: true, selectedOption: args.value });
      }

      const inputType = await el.getAttribute("type").catch(() => "");
      if (inputType === "radio" || inputType === "checkbox") {
        await el.check({ timeout: 5_000 });
        return JSON.stringify({ success: true, selectedOption: args.value });
      }

      await el.click({ timeout: 5_000 });
      return JSON.stringify({ success: true, selectedOption: args.value });
    },
  });

  // ── upload_resume ────────────────────────────────────────────
  server.addTool({
    name: "upload_resume",
    description:
      "Upload a CV/resume file to a file input on the current page. Uses the primary CV by default, or specify a document ID.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the file input"),
      document_id: z
        .string()
        .optional()
        .describe("Document ID to upload. If omitted, uses the primary CV."),
    }),
    execute: async (args, context) => {
      const page = requireActivePage();
      const apiKey = context.session?.apiKey;

      let fileUrl: string;
      let fileName: string;

      if (args.document_id) {
        const doc = (await apiCall(`/api/document/${args.document_id}`, {}, apiKey)) as {
          data?: { fileUrl?: string; name?: string; fileType?: string };
        };
        if (!doc.data?.fileUrl) throw new Error("Document not found or has no file URL.");
        fileUrl = doc.data.fileUrl;
        fileName = doc.data.name || "resume";
      } else {
        const cvData = (await apiCall("/api/document/cvs", {}, apiKey)) as {
          items?: Array<{ id: string; name: string; fileUrl?: string; isPrimary?: boolean; fileType?: string }>;
        };
        const cvs = cvData.items || [];
        const primary = cvs.find((c) => c.isPrimary) || cvs[0];
        if (!primary) throw new Error("No CVs found. Upload a CV first.");
        if (!primary.fileUrl) throw new Error("CV has no download URL.");
        fileUrl = primary.fileUrl;
        fileName = primary.name;
      }

      const ext = fileName.includes(".") ? fileName.split(".").pop() : "docx";
      const tempPath = join(tmpdir(), `jj-resume-${Date.now()}.${ext}`);

      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to download CV: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(tempPath, buffer);

        await page.locator(args.selector).first().setInputFiles(tempPath, { timeout: 10_000 });

        return JSON.stringify({ success: true, fileName });
      } finally {
        if (existsSync(tempPath)) {
          try { unlinkSync(tempPath); } catch { /* ignore */ }
        }
      }
    },
  });

  // ── click_element ────────────────────────────────────────────
  server.addTool({
    name: "click_element",
    description:
      "Click a button or link on the current page (e.g., Next, Submit, Continue). Returns whether the page URL changed or new content appeared.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the element to click"),
      description: z
        .string()
        .optional()
        .describe("What this click does (for logging, e.g. 'Next step')"),
    }),
    execute: async (args) => {
      const page = requireActivePage();
      const urlBefore = page.url();
      const fieldCountBefore = await page
        .locator("input:visible, textarea:visible, select:visible")
        .count()
        .catch(() => 0);

      await page.locator(args.selector).first().click({ timeout: 10_000 });

      await page
        .waitForLoadState("domcontentloaded", { timeout: 5_000 })
        .catch(() => {});
      await page.waitForTimeout(1_000);

      const newUrl = page.url();
      const fieldCountAfter = await page
        .locator("input:visible, textarea:visible, select:visible")
        .count()
        .catch(() => 0);

      const pageChanged = newUrl !== urlBefore || fieldCountAfter !== fieldCountBefore;

      return JSON.stringify({ success: true, newUrl, pageChanged });
    },
  });

  // ── set_default_cv ───────────────────────────────────────────
  server.addTool({
    name: "set_default_cv",
    description:
      "Set a CV as the default/primary document for auto-apply resume uploads.",
    parameters: z.object({
      document_id: z.string().describe("The CV document ID to set as primary"),
    }),
    execute: async (args, context) => {
      const apiKey = context.session?.apiKey;
      const result = (await apiCall(`/api/document/${args.document_id}/set-primary`, {
        method: "PUT",
      }, apiKey)) as { data?: { name?: string }; errorCode?: string; message?: string };

      if (result.errorCode) {
        throw new Error(result.message || "Failed to set primary CV");
      }

      return JSON.stringify({
        success: true,
        documentName: result.data?.name || args.document_id,
      });
    },
  });

  // ── take_page_screenshot ─────────────────────────────────────
  server.addTool({
    name: "take_page_screenshot",
    description:
      "Take a screenshot of the current page for visual inspection. Useful for verifying form state, handling CAPTCHAs, or debugging unusual layouts.",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();
      const buffer = await page.screenshot({ fullPage: false });
      const base64 = buffer.toString("base64");
      return `data:image/png;base64,${base64}`;
    },
  });

  // ── close_browser ────────────────────────────────────────────
  server.addTool({
    name: "close_browser",
    description: "Close the browser session and clean up resources.",
    parameters: z.object({}),
    execute: async () => {
      await closeBrowserSession();
      return "Browser closed.";
    },
  });
}
