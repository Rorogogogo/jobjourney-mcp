import { type Page } from "playwright";

/**
 * Inject the auto-apply progress overlay (top-right floating card).
 * Mirrors the scraping overlay style from src/scraper/core/browser.ts.
 */
export async function injectAutoApplyOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("__jj-autoapply-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "__jj-autoapply-overlay";

    // Header: logo + title + spinner
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px";

    // JJ Logo (inline SVG)
    const logoContainer = document.createElement("div");
    logoContainer.style.cssText = "width:28px;height:28px;flex-shrink:0";
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 282.29 250.57");
    svg.setAttribute("width", "28");
    svg.setAttribute("height", "28");
    const p1 = document.createElementNS(ns, "path");
    p1.setAttribute("fill", "#3160a3");
    p1.setAttribute("d", "M280.26,49.74c-2.27-3.43-6.99-6.48-16.56-6.48h-23.4v-8.59h-21.04l-.37,8.22h-.6l-25.11-.07S188.63,0,141.5,0h-.35c-46.8,.21-51.37,42.82-51.37,42.82h-.68l-25.1,.15v-8.3l-21.04-.15v8.3h-.97s-26.29,.15-26.29,.15c0,0-9.41-1.6-13.66,6.75,0,.01-.01,.02-.02,.03C.97,51.83,.24,54.54,.05,58.04H.05c-.03,.59-.05,1.19-.05,1.81v126.82s.07,.19,.21,.53c1.33,3.15,8.85,19.29,24.09,19.03,0,0,.2,.04,.56,.08,2.48,.29,12.4,.76,13.95-9.86,1.27-8.64,12.97-54.12,47.71-79.69,.37-.28,.76-.56,1.15-.83,12.78-9.11,28.6-15.53,48.07-16.53,1.77-.09,3.57-.14,5.4-.14s3.7,.05,5.51,.15c19.21,1.04,35.05,7.52,47.97,16.52,.38,.28,.77,.55,1.15,.83,35.82,25.74,48.67,70.8,48.67,70.8,0,0,1.64,17.32,12.99,18.75,.49,.07,1,.1,1.53,.1,12.74,0,23.11-6.81,23.11-13.12V59.26s.11-.49,.17-1.3c.14-1.79,.05-5.16-1.98-8.22Zm-139.12,39.31c-20.78,0-37.64-16.85-37.64-37.64S120.36,13.77,141.14,13.77s37.64,16.85,37.64,37.64-16.85,37.64-37.64,37.64Z");
    const p2 = document.createElementNS(ns, "path");
    p2.setAttribute("fill", "#d3aa32");
    p2.setAttribute("d", "M136.03,132.37h9.33s12.89-4.22,12.89-12.44-8.89-8.67-8.89-8.67h-16.89s-8.44,.22-8.44,8.67,12,12.44,12,12.44Z");
    const p3 = document.createElementNS(ns, "path");
    p3.setAttribute("fill", "#d3aa32");
    p3.setAttribute("d", "M148.04,137.04h-14s-8.84,80.22-8.84,80.22c0,0-2.4,7.56,0,11.78,2.4,4.22,12.53,19.56,12.53,19.56,0,0,3.69,4.44,7,0s9.95-19.56,9.95-19.56c0,0,1.47-2.89,0-11.11-1.47-8.22-6.63-80.89-6.63-80.89Z");
    svg.appendChild(p1);
    svg.appendChild(p2);
    svg.appendChild(p3);
    logoContainer.appendChild(svg);

    const titleGroup = document.createElement("div");
    titleGroup.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0";

    const title = document.createElement("span");
    title.style.cssText = "font-weight:600;font-size:14px;color:#000;line-height:1.2";
    title.textContent = "JobJourney";

    const subtitle = document.createElement("span");
    subtitle.id = "__jj-aa-subtitle";
    subtitle.style.cssText = "font-size:11px;color:#71717a;line-height:1.2";
    subtitle.textContent = "Auto-filling in progress";

    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const spinner = document.createElement("div");
    spinner.id = "__jj-aa-spinner";
    spinner.style.cssText = "width:16px;height:16px;border:2px solid #e4e4e7;border-top-color:#3160a3;border-radius:50%;animation:__jj-aa-spin 0.8s linear infinite;flex-shrink:0";

    header.appendChild(logoContainer);
    header.appendChild(titleGroup);
    header.appendChild(spinner);

    // Progress text
    const progressText = document.createElement("div");
    progressText.id = "__jj-aa-progress-text";
    progressText.style.cssText = "font-size:12px;color:#52525b;margin-bottom:10px";
    progressText.textContent = "Loading profile...";

    // Progress bar
    const barContainer = document.createElement("div");
    barContainer.style.cssText = "background:#f4f4f5;border-radius:6px;height:5px;overflow:hidden;margin-bottom:12px";

    const bar = document.createElement("div");
    bar.id = "__jj-aa-progress-bar";
    bar.style.cssText = "height:100%;background:#3160a3;border-radius:6px;width:0%;transition:width 0.3s ease";
    barContainer.appendChild(bar);

    // Footer: field count + status
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:space-between;align-items:center";

    const fieldCount = document.createElement("span");
    fieldCount.id = "__jj-aa-field-count";
    fieldCount.style.cssText = "font-size:11px;color:#a1a1aa";
    fieldCount.textContent = "0 fields filled";

    footer.appendChild(fieldCount);

    overlay.appendChild(header);
    overlay.appendChild(progressText);
    overlay.appendChild(barContainer);
    overlay.appendChild(footer);

    const style = document.createElement("style");
    style.textContent = [
      "#__jj-autoapply-overlay {",
      "  position: fixed; top: 16px; right: 16px; z-index: 2147483647;",
      "  background: #fff; color: #18181b;",
      "  border-radius: 16px; padding: 16px 20px;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
      "  box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06);",
      "  border: 1px solid rgba(0,0,0,0.06);",
      "  min-width: 260px; max-width: 300px; user-select: none;",
      "}",
      "@keyframes __jj-aa-spin { to { transform: rotate(360deg); } }",
    ].join("\n");

    document.head.appendChild(style);
    document.body.appendChild(overlay);
  });
}

/**
 * Update the overlay progress. Silently no-ops if page closed or overlay removed.
 */
export async function updateAutoApplyOverlay(
  page: Page,
  update: {
    text: string;
    percent: number;
    fieldsFilled?: number;
  },
): Promise<void> {
  try {
    await page.evaluate((u: { text: string; percent: number; fieldsFilled?: number }) => {
      const text = document.getElementById("__jj-aa-progress-text");
      const bar = document.getElementById("__jj-aa-progress-bar");
      const count = document.getElementById("__jj-aa-field-count");
      if (!text) return;
      text.textContent = u.text;
      if (bar) bar.style.width = Math.min(100, u.percent) + "%";
      if (count && u.fieldsFilled !== undefined) {
        count.textContent = u.fieldsFilled + " field" + (u.fieldsFilled !== 1 ? "s" : "") + " filled";
      }
    }, update);
  } catch {
    // Page closed or navigated
  }
}

/**
 * Mark the overlay as complete (green checkmark, no spinner).
 */
export async function completeAutoApplyOverlay(
  page: Page,
  summary: { fieldsFilled: number; totalFields: number; confidence: string },
): Promise<void> {
  try {
    await page.evaluate((s: { fieldsFilled: number; totalFields: number; confidence: string }) => {
      const subtitle = document.getElementById("__jj-aa-subtitle");
      const spinner = document.getElementById("__jj-aa-spinner");
      const text = document.getElementById("__jj-aa-progress-text");
      const bar = document.getElementById("__jj-aa-progress-bar");
      const count = document.getElementById("__jj-aa-field-count");

      if (subtitle) subtitle.textContent = "Auto-fill complete";
      if (spinner) {
        spinner.style.animation = "none";
        spinner.style.border = "none";
        spinner.textContent = "\u2713";
        spinner.style.cssText = "width:16px;height:16px;color:#16a34a;font-size:16px;font-weight:bold;flex-shrink:0;text-align:center;line-height:16px";
      }
      if (text) text.textContent = `Filled ${s.fieldsFilled}/${s.totalFields} fields (${s.confidence} confidence)`;
      if (bar) {
        bar.style.width = "100%";
        bar.style.background = "#16a34a";
      }
      if (count) count.textContent = "Please review before submitting";

      // Auto-hide after 10 seconds
      const overlay = document.getElementById("__jj-autoapply-overlay");
      if (overlay) {
        setTimeout(() => {
          overlay.style.transition = "opacity 0.5s ease";
          overlay.style.opacity = "0";
          setTimeout(() => overlay.remove(), 500);
        }, 10_000);
      }
    }, summary);
  } catch {
    // Page closed or navigated
  }
}
