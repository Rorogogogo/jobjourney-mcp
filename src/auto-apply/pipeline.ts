import { launchBrowser } from "../scraper/core/browser.js";
import { resolveApplyUrl } from "./resolve-apply-url.js";
import { detectAts } from "../discovery/ats/detector.js";
import { loadUserProfile } from "./profile-loader.js";
import { fillApplicationForm } from "./form-filler.js";

export interface AutoApplyRequest {
  requestId: string;
  jobUrl: string;
  /** API key used to fetch the user profile. Falls back to JOBJOURNEY_API_KEY env var. */
  apiKey?: string;
}

export interface AutoApplyResult {
  success: boolean;
  resolvedUrl?: string;
  atsType?: string;
  fieldsAttempted?: number;
  fieldsFilled?: number;
  error?: string;
}

/**
 * Full auto-apply pipeline:
 * 1. Resolve aggregator URL (LinkedIn/Seek/Indeed) → real ATS URL
 * 2. Detect ATS type
 * 3. Load user profile from API
 * 4. Open the application form and fill it using the profile
 *
 * Streams progress via onProgress so callers (e.g. SignalR) can relay updates.
 */
export async function runAutoApplyPipeline(
  request: AutoApplyRequest,
  onProgress: (msg: string) => Promise<void>,
): Promise<AutoApplyResult> {
  const apiKey = request.apiKey ?? process.env.JOBJOURNEY_API_KEY ?? "";
  const browser = await launchBrowser();

  try {
    // ── Step 1: resolve aggregator → real ATS URL ──────────────────────────
    await onProgress("Resolving job application URL...");
    const resolvedUrl = await resolveApplyUrl(request.jobUrl, browser, (msg) => {
      void onProgress(msg);
    });

    // ── Step 2: detect ATS ─────────────────────────────────────────────────
    const atsDetection = detectAts(resolvedUrl);
    await onProgress(`Detected ATS: ${atsDetection.atsType} — ${resolvedUrl}`);

    // ── Step 3: load user profile ──────────────────────────────────────────
    await onProgress("Loading your profile...");
    let profile;
    try {
      profile = await loadUserProfile(apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await onProgress(`Warning: could not load profile (${msg}), continuing without it`);
      profile = {};
    }

    // ── Step 4: navigate to the form and fill it ───────────────────────────
    await onProgress("Opening application form...");
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(resolvedUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

      const fillResult = await fillApplicationForm(
        page,
        atsDetection.atsType,
        profile,
        (msg) => void onProgress(msg),
      );

      await onProgress(
        `Done — ${fillResult.fieldsFilled}/${fillResult.fieldsAttempted} fields filled.` +
          (fillResult.skipped.length ? ` Skipped: ${fillResult.skipped.join(", ")}` : ""),
      );

      return {
        success: true,
        resolvedUrl,
        atsType: atsDetection.atsType,
        fieldsAttempted: fillResult.fieldsAttempted,
        fieldsFilled: fillResult.fieldsFilled,
      };
    } finally {
      await context.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auto-apply] pipeline error:", error);
    return { success: false, error: message };
  } finally {
    await browser.close();
  }
}
