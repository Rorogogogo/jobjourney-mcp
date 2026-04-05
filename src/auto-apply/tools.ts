import { FastMCP } from "fastmcp";
import { z } from "zod";
import { type SessionAuth } from "../types.js";
import { apiCall } from "../api.js";
import { openPage, requireActivePage, closeBrowserSession, getActiveBrowser, isBrowserDead } from "./browser-session.js";
import { resolveApplyUrl, detectAggregator } from "./resolve-apply-url.js";
import { extractFormFields } from "./dom-extractor.js";
import { autoFillApplication } from "./auto-fill.js";
import { detectVerification } from "./verification-detect.js";
import { injectAutoApplyOverlay, updateAutoApplyOverlay, completeAutoApplyOverlay } from "./overlay.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function registerAutoApplyTools(server: FastMCP<SessionAuth>): void {
  // Track fields filled for overlay progress
  let fieldsFilled = 0;

  // ── open_application_page ────────────────────────────────────
  server.addTool({
    name: "open_application_page",
    description:
      "Open a job application page in the browser. Detects aggregator sites (LinkedIn/Seek/Indeed) and resolves to the real application URL. Keeps the browser open for subsequent tool calls. After calling this, always call extract_form_fields next (NOT take_page_screenshot).",
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

      // Reset counter and inject progress overlay
      fieldsFilled = 0;
      await injectAutoApplyOverlay(browserPage).catch(() => {});
      await updateAutoApplyOverlay(browserPage, { text: "Page loaded, ready to fill", percent: 5 }).catch(() => {});

      return JSON.stringify({ resolvedUrl, pageTitle });
    },
  });

  // ── extract_form_fields ──────────────────────────────────────
  server.addTool({
    name: "extract_form_fields",
    description:
      "PRIMARY TOOL — always call this first after opening a page. Extracts all visible form fields as a compact indexed list (~500 tokens) with label, type, options, and CSS selector for each field. This is far cheaper and faster than a screenshot. Only fall back to take_page_screenshot if this returns unexpected results or you need visual debugging (e.g. CAPTCHAs, unusual layouts). Call open_application_page first.",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();
      const result = await extractFormFields(page);
      const verification = await detectVerification(page);
      return JSON.stringify({
        ...result,
        ...(verification.detected ? { verification } : {}),
      }, null, 2);
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
      fieldsFilled++;
      await updateAutoApplyOverlay(page, { text: `Filling form fields...`, percent: Math.min(90, 10 + fieldsFilled * 5), fieldsFilled }).catch(() => {});
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
      } else {
        const inputType = await el.getAttribute("type").catch(() => "");
        if (inputType === "radio" || inputType === "checkbox") {
          await el.check({ timeout: 5_000 });
        } else {
          await el.click({ timeout: 5_000 });
        }
      }

      fieldsFilled++;
      await updateAutoApplyOverlay(page, { text: `Filling form fields...`, percent: Math.min(90, 10 + fieldsFilled * 5), fieldsFilled }).catch(() => {});
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

      // Check for verification/challenge pages after navigation
      const verification = await detectVerification(page);

      return JSON.stringify({
        success: true,
        newUrl,
        pageChanged,
        ...(verification.detected ? { verification } : {}),
      });
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
      "FALLBACK ONLY — do NOT call this as a first step. Use extract_form_fields first to analyze the page (compact, ~500 tokens). Only use this screenshot tool when: (1) extract_form_fields returns empty/unexpected results and you need to see why, (2) you suspect a CAPTCHA or visual challenge, (3) you need to verify the visual state after filling. Returns a compressed JPEG (~30-50K tokens).",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();

      // Resize viewport to reduce screenshot size
      const viewport = page.viewportSize();
      const needsResize = viewport && viewport.width > 1280;
      if (needsResize) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(300);
      }

      // Use JPEG at 70% quality instead of full PNG — ~5-10x smaller
      const buffer = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 70,
      });

      // Restore original viewport
      if (needsResize && viewport) {
        await page.setViewportSize(viewport);
      }

      const base64 = buffer.toString("base64");
      return `data:image/jpeg;base64,${base64}`;
    },
  });

  // ── get_page_snapshot ─────────────────────────────────────────
  server.addTool({
    name: "get_page_snapshot",
    description:
      "Get a compact accessibility-like snapshot of the current page. Use this when extract_form_fields returns empty (e.g. React SPAs with non-standard elements) but you still need to understand the page structure. Much cheaper than a screenshot (~2-5K tokens). Returns interactive elements with roles, names, and Playwright selectors you can use with fill_form_field and click_element.",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();

      const items = await page.evaluate(() => {
        const interactiveRoles = new Set([
          "textbox", "combobox", "listbox", "searchbox", "spinbutton",
          "checkbox", "radio", "switch", "slider",
          "button", "link", "option",
        ]);

        const interactiveTags = new Set([
          "INPUT", "TEXTAREA", "SELECT", "BUTTON", "A",
        ]);

        interface SnapshotItem {
          role: string;
          name: string;
          value?: string;
          required?: boolean;
          checked?: boolean;
          type?: string;
          selector: string;
        }

        const results: SnapshotItem[] = [];
        const seen = new Set<Element>();

        function getLabel(el: Element): string {
          // aria-label
          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel) return ariaLabel.trim();
          // aria-labelledby
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const ref = document.getElementById(labelledBy);
            if (ref) return ref.textContent?.trim() || "";
          }
          // label[for]
          if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) return label.textContent?.trim() || "";
          }
          // parent label
          const parentLabel = el.closest("label");
          if (parentLabel) {
            const clone = parentLabel.cloneNode(true) as Element;
            clone.querySelectorAll("input,select,textarea,button").forEach(c => c.remove());
            const text = clone.textContent?.trim();
            if (text) return text;
          }
          // placeholder
          return el.getAttribute("placeholder") || el.getAttribute("aria-placeholder") || "";
        }

        function buildSelector(el: Element): string {
          if (el.id) return "#" + CSS.escape(el.id);
          const name = el.getAttribute("name");
          if (name) {
            const byName = document.querySelectorAll(`[name="${CSS.escape(name)}"]`);
            if (byName.length === 1) return `[name="${CSS.escape(name)}"]`;
          }
          // Role + name selector for Playwright
          const role = el.getAttribute("role");
          const label = getLabel(el);
          if (role && label) {
            return `[role="${role}"][aria-label="${CSS.escape(label)}"]`;
          }
          // Fallback: path
          const parts: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.body) {
            const parent: Element | null = current.parentElement;
            if (!parent) break;
            const index = Array.from(parent.children).indexOf(current) + 1;
            parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
            current = parent;
          }
          return "body > " + parts.join(" > ");
        }

        function isVisible(el: Element): boolean {
          const htmlEl = el as HTMLElement;
          if (!htmlEl.offsetParent && htmlEl.style?.position !== "fixed") return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }

        // Collect all interactive elements
        const allElements = document.querySelectorAll("*");
        for (const el of allElements) {
          if (seen.has(el) || !isVisible(el)) continue;

          const role = el.getAttribute("role");
          const tag = el.tagName;
          const isInteractive = (role && interactiveRoles.has(role)) || interactiveTags.has(tag);
          if (!isInteractive) continue;

          seen.add(el);

          const name = getLabel(el);
          const effectiveRole = role || tag.toLowerCase();

          // Skip generic buttons/links without names
          if ((effectiveRole === "button" || effectiveRole === "link" || effectiveRole === "a") && !name) continue;

          const item: SnapshotItem = {
            role: effectiveRole,
            name: name.substring(0, 100),
            selector: buildSelector(el),
          };

          // Value
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            if (el.value) item.value = el.value.substring(0, 200);
            if (el instanceof HTMLInputElement) item.type = el.type;
          } else if (el instanceof HTMLSelectElement) {
            item.value = el.options[el.selectedIndex]?.text?.trim();
          } else if (role === "textbox" || role === "combobox" || role === "searchbox") {
            const inner = el.querySelector("input");
            if (inner) item.value = inner.value?.substring(0, 200);
            else item.value = el.textContent?.trim()?.substring(0, 200);
          }

          // Required
          if ((el as HTMLInputElement).required || el.getAttribute("aria-required") === "true") {
            item.required = true;
          }

          // Checked
          if (role === "checkbox" || role === "radio" || role === "switch") {
            item.checked = el.getAttribute("aria-checked") === "true" || (el as HTMLInputElement).checked === true;
          }

          results.push(item);
        }

        return results;
      });

      return JSON.stringify({
        pageTitle: await page.title(),
        url: page.url(),
        interactiveElements: items,
        totalElements: items.length,
      }, null, 2);
    },
  });

  // ── auto_fill_application ─────────────────────────────────────
  server.addTool({
    name: "auto_fill_application",
    description:
      "Smart one-click form filling: opens a job application page, uses AI to analyze all form fields, and fills them automatically from the user's profile. Handles multi-page forms, dropdowns, radio buttons, and resume uploads. Requires ANTHROPIC_API_KEY env var.",
    parameters: z.object({
      url: z.string().url().describe("The job listing or application URL"),
      job_title: z.string().optional().describe("Job title for context (helps with cover letter fields)"),
      company: z.string().optional().describe("Company name for context"),
      job_description: z.string().optional().describe("Brief job description for context"),
    }),
    execute: async (args, context) => {
      const apiKey = context.session?.apiKey;

      // Open the page (reuses browser session logic)
      const { page: browserPage, resolvedUrl: initialUrl } = await openPage(args.url);
      let resolvedUrl = initialUrl;

      // Resolve aggregator URLs (LinkedIn/Seek/Indeed → real ATS)
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

      const result = await autoFillApplication(
        browserPage,
        apiKey!,
        {
          title: args.job_title,
          company: args.company,
          description: args.job_description,
        },
      );

      return JSON.stringify({
        resolvedUrl,
        ...result,
        message: result.totalFieldsFilled > 0
          ? `Filled ${result.totalFieldsFilled}/${result.totalFieldsFound} fields across ${result.pagesProcessed} page(s). ` +
            `Confidence: ${result.confidence}.` +
            (result.resumeUploaded ? " Resume uploaded." : "") +
            (result.skippedFields.length > 0
              ? ` Skipped ${result.skippedFields.length} field(s) — review may be needed.`
              : "") +
            (result.errors.length > 0
              ? ` ${result.errors.length} error(s) encountered.`
              : "")
          : "No fields were filled. The page may not have a visible application form.",
      }, null, 2);
    },
  });

  // ── check_auto_apply_setup ────────────────────────────────────
  server.addTool({
    name: "check_auto_apply_setup",
    description:
      "Pre-flight check before auto-apply. Verifies the user's profile has all mandatory fields filled and a default resume is set. If anything is missing, returns the profile page URL so the agent can open it for the user to complete. Call this BEFORE starting any auto-apply session.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const apiKey = context.session?.apiKey;
      const missing: string[] = [];
      const ready: string[] = [];
      const recommended: string[] = [];

      // Load full profile
      let profile: Record<string, any> = {};
      try {
        profile = (await apiCall("/api/profile", {}, apiKey)) as Record<string, any>;
      } catch {
        return JSON.stringify({
          canProceed: false,
          missing: ["Could not load profile — check your API key"],
          ready: [],
          recommended: [],
          profileUrl: "https://jobjourney.me/profile",
        }, null, 2);
      }

      // Mandatory checks
      if (profile.firstName && profile.lastName) ready.push(`Name: ${profile.firstName} ${profile.lastName}`);
      else missing.push("Full name (first + last)");

      if (profile.email) ready.push(`Email: ${profile.email}`);
      else missing.push("Email address");

      if (profile.phoneNumber) ready.push(`Phone: ${profile.phoneNumber}`);
      else missing.push("Phone number");

      if (profile.city && profile.country) ready.push(`Address: ${[profile.city, profile.state, profile.country].filter(Boolean).join(", ")}`);
      else missing.push("Address (at minimum city + country)");

      if (profile.workAuthorization) ready.push(`Work Authorization: ${profile.workAuthorization}`);
      else missing.push("Work authorization status");

      // Check CV / resume (mandatory — must have a primary)
      let resumes: Array<{ id: string; name: string; isPrimary: boolean }> = [];
      let hasPrimaryResume = false;
      try {
        const cvData = (await apiCall("/api/document/cvs", {}, apiKey)) as {
          items?: Array<{ id: string; name: string; isPrimary?: boolean }>;
        };
        resumes = (cvData.items || []).map((c) => ({
          id: c.id,
          name: c.name,
          isPrimary: !!c.isPrimary,
        }));
        const primary = resumes.find((r) => r.isPrimary);
        if (primary) {
          ready.push(`Default resume: ${primary.name}`);
          hasPrimaryResume = true;
        } else if (resumes.length > 0) {
          missing.push(`Default resume not set (${resumes.length} resume(s) uploaded — set one as primary)`);
        } else {
          missing.push("No resumes uploaded — upload at least one resume");
        }
      } catch {
        missing.push("Could not check resumes");
      }

      // Recommended (not mandatory)
      if (!profile.salaryMin && !profile.salaryMax) recommended.push("Salary expectations");
      if (!profile.noticePeriod) recommended.push("Notice period / availability");
      if (!profile.nationality) recommended.push("Nationality");
      if (!profile.gender) recommended.push("EEO self-identification (voluntary)");
      if (!profile.defaultHowDidYouHear) recommended.push("Default 'How did you hear about us' answer");

      // Anthropic API key (for autonomous mode)
      if (process.env.ANTHROPIC_API_KEY) {
        ready.push("Autonomous mode available (Anthropic API key configured)");
      }

      const canProceed = missing.length === 0;
      const profileUrl = "https://jobjourney.me/profile";

      // Email MCP hint
      const emailHint = {
        recommendation: "Set up an email MCP (Gmail, Outlook, etc.) for handling verification codes automatically",
        why: "Many job sites send email verification codes during registration. Without email access, you'll need to enter codes manually.",
        setup: {
          claude_code: "Authenticate the Gmail MCP in Settings > MCP Servers",
          other_agents: "Install a Gmail/Outlook MCP server compatible with your agent",
        },
      };

      return JSON.stringify({
        canProceed,
        missing,
        ready,
        recommended,
        resumes,
        hasPrimaryResume,
        profileUrl,
        profileAutoApplyTab: `${profileUrl}#auto-apply`,
        emailMcp: emailHint,
        message: canProceed
          ? `Ready for auto-apply! ${recommended.length > 0 ? `${recommended.length} optional field(s) could improve results.` : ""}`
          : `Cannot start auto-apply: ${missing.length} required item(s) missing. Open ${profileUrl} (Auto Apply tab) to complete your profile.`,
      }, null, 2);
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
