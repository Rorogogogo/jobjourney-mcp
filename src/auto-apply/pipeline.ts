import { launchBrowser } from "../scraper/core/browser.js";
import { resolveApplyUrl } from "./resolve-apply-url.js";
import { detectAts } from "../discovery/ats/detector.js";

export interface AutoApplyRequest {
  requestId: string;
  jobUrl: string;
}

export interface AutoApplyResult {
  success: boolean;
  resolvedUrl?: string;
  atsType?: string;
  error?: string;
}

/**
 * Full auto-apply pipeline:
 * 1. Resolve aggregator URL (LinkedIn/Seek/Indeed) → real ATS URL via Playwright
 * 2. Detect ATS type
 * 3. (Future) Fill and submit form
 *
 * Calls onProgress throughout so callers (e.g. SignalR) can stream updates.
 */
export async function runAutoApplyPipeline(
  request: AutoApplyRequest,
  onProgress: (msg: string) => Promise<void>,
): Promise<AutoApplyResult> {
  const browser = await launchBrowser();

  try {
    await onProgress("Resolving job application URL...");

    const resolvedUrl = await resolveApplyUrl(request.jobUrl, browser, (msg) => {
      void onProgress(msg);
    });

    const atsDetection = detectAts(resolvedUrl);
    await onProgress(`Detected ATS: ${atsDetection.atsType} — ${resolvedUrl}`);

    // TODO: dispatch to ATS-specific form filler (Greenhouse, Lever, Workday, etc.)

    return {
      success: true,
      resolvedUrl,
      atsType: atsDetection.atsType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auto-apply] pipeline error:", error);
    return { success: false, error: message };
  } finally {
    await browser.close();
  }
}
