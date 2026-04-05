import { type Page } from "playwright";
import { extractFormFields, type ExtractedField } from "./dom-extractor.js";
import { loadUserProfile, type UserProfile } from "./profile-loader.js";
import { buildFillPlan, type FillAction, type FillPlan } from "./fill-planner.js";
import { injectAutoApplyOverlay, updateAutoApplyOverlay, completeAutoApplyOverlay } from "./overlay.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiCall } from "../api.js";

const MAX_PAGES = 5;

export interface AutoFillResult {
  pagesProcessed: number;
  totalFieldsFound: number;
  totalFieldsFilled: number;
  skippedFields: Array<{ label: string; reason: string }>;
  errors: string[];
  resumeUploaded: boolean;
  confidence: "high" | "medium" | "low";
}

interface ExecuteResult {
  filled: number;
  skipped: Array<{ label: string; reason: string }>;
  errors: string[];
}

async function executePlan(
  page: Page,
  fields: ExtractedField[],
  plan: FillPlan,
): Promise<ExecuteResult> {
  let filled = 0;
  const skipped: Array<{ label: string; reason: string }> = [];
  const errors: string[] = [];

  for (const action of plan.actions) {
    const field = fields[action.index];
    if (!field) continue;

    if (action.action === "skip") {
      skipped.push({ label: field.label || `field[${action.index}]`, reason: action.reason || "unknown" });
      continue;
    }

    try {
      const el = page.locator(field.selector).first();

      if (action.action === "fill") {
        await el.fill(action.value, { timeout: 5_000 });

        // Verify value stuck (React/Angular controlled inputs)
        const actual = await el.inputValue({ timeout: 2_000 }).catch(() => "");
        if (actual !== action.value) {
          await el.click({ timeout: 3_000 });
          await el.fill("", { timeout: 2_000 });
          await page.keyboard.type(action.value, { delay: 20 });
        }
        filled++;
      } else if (action.action === "select") {
        const tagName = await el.evaluate((e: Element) => e.tagName).catch(() => "");

        if (tagName === "SELECT") {
          await el
            .selectOption({ label: action.value }, { timeout: 5_000 })
            .catch(() => el.selectOption({ value: action.value }, { timeout: 5_000 }));
        } else {
          // Radio group — find the matching option
          const name = await el.getAttribute("name").catch(() => "");
          if (name) {
            const radio = page.locator(
              `input[type=radio][name="${name}"]`
            );
            const count = await radio.count();
            let matched = false;
            for (let i = 0; i < count; i++) {
              const label = await radio.nth(i).evaluate((r: Element) => {
                const lbl = r.id ? document.querySelector(`label[for="${r.id}"]`) : null;
                return lbl?.textContent?.trim() || (r as HTMLInputElement).value;
              });
              if (label?.toLowerCase().includes(action.value.toLowerCase())) {
                await radio.nth(i).check({ timeout: 5_000 });
                matched = true;
                break;
              }
            }
            if (!matched) {
              await el.click({ timeout: 5_000 });
            }
          } else {
            await el.click({ timeout: 5_000 });
          }
        }
        filled++;
      } else if (action.action === "check") {
        await el.check({ timeout: 5_000 });
        filled++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Field "${field.label || action.index}": ${msg}`);
    }
  }

  return { filled, skipped, errors };
}

async function tryUploadResume(
  page: Page,
  fields: ExtractedField[],
  apiKey: string,
): Promise<boolean> {
  const fileField = fields.find((f) => f.type === "file");
  if (!fileField) return false;

  // Fetch primary CV
  const cvData = (await apiCall("/api/document/cvs", {}, apiKey)) as {
    items?: Array<{ id: string; name: string; fileUrl?: string; isPrimary?: boolean }>;
  };
  const cvs = cvData.items || [];
  const primary = cvs.find((c) => c.isPrimary) || cvs[0];
  if (!primary?.fileUrl) return false;

  const ext = primary.name.includes(".") ? primary.name.split(".").pop() : "docx";
  const tempPath = join(tmpdir(), `jj-resume-${Date.now()}.${ext}`);

  try {
    const response = await fetch(primary.fileUrl);
    if (!response.ok) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(tempPath, buffer);
    await page.locator(fileField.selector).first().setInputFiles(tempPath, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  } finally {
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch { /* ignore */ }
    }
  }
}

function detectPageChange(urlBefore: string, urlAfter: string, fieldsBefore: number, fieldsAfter: number): boolean {
  return urlAfter !== urlBefore || fieldsAfter !== fieldsBefore;
}

export async function autoFillApplication(
  page: Page,
  apiKey: string,
  jobContext?: { title?: string; company?: string; description?: string },
  onProgress?: (msg: string) => void,
): Promise<AutoFillResult> {
  // Inject progress overlay
  await injectAutoApplyOverlay(page).catch(() => {});
  await updateAutoApplyOverlay(page, { text: "Loading profile...", percent: 5 }).catch(() => {});

  const profile = await loadUserProfile(apiKey);
  onProgress?.("Loaded user profile");
  await updateAutoApplyOverlay(page, { text: "Profile loaded, analyzing form...", percent: 10 }).catch(() => {});

  let pagesProcessed = 0;
  let totalFieldsFound = 0;
  let totalFieldsFilled = 0;
  const allSkipped: Array<{ label: string; reason: string }> = [];
  const allErrors: string[] = [];
  let resumeUploaded = false;
  let overallConfidence: "high" | "medium" | "low" = "high";

  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
    onProgress?.(`Analyzing form page ${pageNum + 1}...`);
    const basePercent = 10 + (pageNum / MAX_PAGES) * 80;
    await updateAutoApplyOverlay(page, { text: `Analyzing page ${pageNum + 1}...`, percent: basePercent, fieldsFilled: totalFieldsFilled }).catch(() => {});

    const extraction = await extractFormFields(page);
    const { fields, context } = extraction;

    if (fields.length === 0) {
      onProgress?.("No form fields found on this page");
      break;
    }

    totalFieldsFound += fields.length;
    pagesProcessed++;

    // Filter out file upload fields for the LLM (handled separately)
    const fillableFields = fields.filter((f) => f.type !== "file");
    const alreadyFilled = fillableFields.filter((f) => f.currentValue).length;

    if (fillableFields.length === 0 || fillableFields.length === alreadyFilled) {
      onProgress?.("All fields already filled or no fillable fields");
      break;
    }

    onProgress?.(`Found ${fillableFields.length} fields, building fill plan...`);
    await updateAutoApplyOverlay(page, { text: `Found ${fillableFields.length} fields, planning...`, percent: basePercent + 10, fieldsFilled: totalFieldsFilled }).catch(() => {});
    let plan: FillPlan;
    try {
      plan = await buildFillPlan(fillableFields, profile, context, jobContext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allErrors.push(`Fill planner error: ${msg}`);
      break;
    }

    if (plan.confidence === "low") overallConfidence = "low";
    else if (plan.confidence === "medium" && overallConfidence === "high") overallConfidence = "medium";

    onProgress?.(`Executing ${plan.actions.length} actions (confidence: ${plan.confidence})...`);
    await updateAutoApplyOverlay(page, { text: `Filling ${plan.actions.length} fields...`, percent: basePercent + 20, fieldsFilled: totalFieldsFilled }).catch(() => {});

    // Map plan indices back to the fillable subset's selectors
    const result = await executePlan(page, fillableFields, plan);
    totalFieldsFilled += result.filled;
    allSkipped.push(...result.skipped);
    allErrors.push(...result.errors);

    // Try resume upload if there's a file field
    if (!resumeUploaded) {
      resumeUploaded = await tryUploadResume(page, fields, apiKey);
      if (resumeUploaded) onProgress?.("Resume uploaded");
    }

    onProgress?.(`Page ${pageNum + 1}: filled ${result.filled} fields`);
    await updateAutoApplyOverlay(page, { text: `Page ${pageNum + 1}: filled ${result.filled} fields`, percent: basePercent + 30, fieldsFilled: totalFieldsFilled }).catch(() => {});

    // Check for multi-page: look for a "Next" / "Continue" button
    const nextButton = page.locator(
      'button:has-text("Next"), button:has-text("Continue"), button:has-text("next"), ' +
      'a:has-text("Next"), a:has-text("Continue"), ' +
      'button[type="button"]:has-text("next step"), button:has-text("Save and continue")'
    ).first();

    const hasNext = await nextButton.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasNext) break;

    // Click next and check if the page actually changed
    const urlBefore = page.url();
    const fieldCountBefore = fields.length;

    await nextButton.click({ timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1_500);

    const urlAfter = page.url();
    const newExtraction = await extractFormFields(page);
    const fieldCountAfter = newExtraction.fields.length;

    if (!detectPageChange(urlBefore, urlAfter, fieldCountBefore, fieldCountAfter)) {
      onProgress?.("Page did not change after clicking Next — may need manual review");
      break;
    }
  }

  // Show completion on overlay
  await completeAutoApplyOverlay(page, {
    fieldsFilled: totalFieldsFilled,
    totalFields: totalFieldsFound,
    confidence: overallConfidence,
  }).catch(() => {});

  return {
    pagesProcessed,
    totalFieldsFound,
    totalFieldsFilled,
    skippedFields: allSkipped,
    errors: allErrors,
    resumeUploaded,
    confidence: overallConfidence,
  };
}
