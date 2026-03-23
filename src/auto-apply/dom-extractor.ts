import { type Page } from "playwright";

export interface ExtractedField {
  selector: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
  currentValue: string;
  options: string[];
  fieldGroup: string | null;
}

export interface PageContext {
  pageTitle: string;
  stepIndicator: string | null;
  errorMessages: string[];
}

export interface ExtractionResult {
  fields: ExtractedField[];
  context: PageContext;
}

function extractionLogic(skipVisibilityCheck: boolean): ExtractionResult {
  const fields: ExtractedField[] = [];
  const seen = new Set<string>();

  function cssEscape(s: string): string {
    if (typeof CSS !== "undefined" && CSS.escape) {
      return CSS.escape(s);
    }
    return s.replace(/([^\w-])/g, "\\$1");
  }

  function getUniqueSelector(el: Element): string {
    if (el.id) return "#" + cssEscape(el.id);
    const name = el.getAttribute("name");
    if (name) {
      const byName = document.querySelectorAll(`[name="${cssEscape(name)}"]`);
      if (byName.length === 1) return `[name="${cssEscape(name)}"]`;
    }
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body) {
      const parent: Element | null = current.parentElement;
      if (!parent) break;
      const children = Array.from(parent.children);
      const index = children.indexOf(current) + 1;
      const tag = current.tagName.toLowerCase();
      parts.unshift(`${tag}:nth-child(${index})`);
      current = parent;
    }
    return "body > " + parts.join(" > ");
  }

  function getLabelText(el: Element): string {
    if (el.id) {
      const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as Element;
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label")!;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const refEl = document.getElementById(labelledBy);
      if (refEl) return refEl.textContent?.trim() || "";
    }
    const prev = el.previousElementSibling;
    if (prev && ["LABEL", "SPAN", "P", "DIV"].includes(prev.tagName)) {
      return (prev.textContent?.trim() || "").substring(0, 100);
    }
    return "";
  }

  function getFieldGroup(el: Element): string | null {
    let current = el.parentElement;
    while (current && current !== document.body) {
      if (current.tagName === "FIELDSET") {
        const legend = current.querySelector(":scope > legend");
        if (legend) return legend.textContent?.trim() || null;
      }
      const headings = ["H1", "H2", "H3", "H4"];
      if (headings.includes(current.tagName)) {
        return current.textContent?.trim() || null;
      }
      // Check for a direct-child heading in this container
      for (const tag of headings) {
        const h = current.querySelector(`:scope > ${tag}`);
        if (h) return h.textContent?.trim() || null;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isVisible(el: Element): boolean {
    if (skipVisibilityCheck) return true;
    const htmlEl = el as HTMLElement;
    if (!htmlEl.offsetParent && (htmlEl).style?.position !== "fixed") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isHoneypot(el: Element): boolean {
    if (skipVisibilityCheck) return false;
    const style = window.getComputedStyle(el);
    if (parseInt(style.left) < -1000 || parseInt(style.top) < -1000) return true;
    if (style.position === "absolute" && (style.left === "-9999px" || style.top === "-9999px")) return true;
    if ((el as HTMLElement).tabIndex === -1 && el.getAttribute("aria-hidden") === "true") return true;
    return false;
  }

  const selector =
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select";
  const elements = document.querySelectorAll(selector);

  for (const el of elements) {
    if (!isVisible(el) || isHoneypot(el)) continue;

    const uniqueSelector = getUniqueSelector(el);
    if (seen.has(uniqueSelector)) continue;
    seen.add(uniqueSelector);

    const inputType =
      el.tagName === "SELECT"
        ? "select"
        : el.tagName === "TEXTAREA"
          ? "textarea"
          : ((el as HTMLInputElement).getAttribute("type") || "text").toLowerCase();

    if (["password", "search"].includes(inputType)) continue;

    let options: string[] = [];
    if (el.tagName === "SELECT") {
      options = Array.from((el as HTMLSelectElement).options)
        .filter((o) => o.value && !o.disabled)
        .map((o) => o.text.trim());
    }

    if (inputType === "radio") {
      const name = el.getAttribute("name");
      if (name && seen.has("radio:" + name)) continue;
      if (name) seen.add("radio:" + name);
      const radios = document.querySelectorAll(`input[type=radio][name="${cssEscape(name || "")}"]`);
      options = Array.from(radios).map((r) => {
        const lbl = document.querySelector(`label[for="${cssEscape(r.id)}"]`);
        return lbl ? lbl.textContent?.trim() || (r as HTMLInputElement).value : (r as HTMLInputElement).value;
      });
    }

    fields.push({
      selector: uniqueSelector,
      type: inputType === "file" ? "file" : inputType,
      label: getLabelText(el),
      placeholder: el.getAttribute("placeholder") || "",
      required:
        (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true",
      currentValue:
        inputType === "checkbox"
          ? String((el as HTMLInputElement).checked)
          : inputType === "radio"
            ? (el as HTMLInputElement).checked
              ? (el as HTMLInputElement).value
              : ""
            : (el as HTMLInputElement).value || "",
      options,
      fieldGroup: getFieldGroup(el),
    });
  }

  const pageTitle = document.title || "";

  let stepIndicator: string | null = null;
  if (!skipVisibilityCheck) {
    const stepPatterns = document.querySelectorAll(
      "[class*=step], [class*=progress], [aria-label*=step], [role=progressbar]"
    );
    for (const el of stepPatterns) {
      if (isVisible(el)) {
        const text = el.textContent?.trim();
        if (text && text.length < 100) {
          stepIndicator = text;
          break;
        }
      }
    }
  }

  const errorMessages: string[] = [];
  if (!skipVisibilityCheck) {
    const errorEls = document.querySelectorAll(
      "[class*=error], [role=alert], .invalid-feedback, .field-error"
    );
    for (const el of errorEls) {
      if (isVisible(el)) {
        const text = el.textContent?.trim();
        if (text && text.length < 200) errorMessages.push(text);
      }
    }
  }

  return { fields, context: { pageTitle, stepIndicator, errorMessages } };
}

/**
 * Directly callable version for testing with jsdom.
 * Skips visibility checks since jsdom does not support layout.
 */
export function runExtractorInDom(): ExtractionResult {
  return extractionLogic(true);
}

/**
 * Returns the JavaScript source for page.evaluate() in a real browser.
 * Includes visibility and honeypot filtering.
 */
export function buildExtractorScript(): string {
  return `(${extractionLogic.toString()})(false)`;
}

/**
 * Extract all visible form fields from the current page, including iframes.
 */
export async function extractFormFields(page: Page): Promise<ExtractionResult> {
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => page.waitForTimeout(1_000));

  const script = buildExtractorScript();
  const mainResult = (await page.evaluate(script)) as ExtractionResult;

  const frames = page.frames();
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      const frameResult = (await frame.evaluate(script)) as ExtractionResult;
      if (frameResult.fields.length > 0) {
        const frameUrl = frame.url();
        const frameName = frame.name() || frameUrl;
        for (const field of frameResult.fields) {
          field.selector = `frame[${frameName}] >> ${field.selector}`;
          field.fieldGroup = field.fieldGroup ? `[iframe] ${field.fieldGroup}` : "[iframe]";
        }
        mainResult.fields.push(...frameResult.fields);
      }
    } catch {
      // Frame may be cross-origin or detached
    }
  }

  return mainResult;
}
