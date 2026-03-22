import { type Page } from "playwright";
import type { UserProfile } from "./profile-loader.js";
import type { DetectedAtsType } from "../discovery/ats/detector.js";

export interface FillResult {
  fieldsAttempted: number;
  fieldsFilled: number;
  skipped: string[];
  submitted: boolean;
}

// ---------------------------------------------------------------------------
// Entry point — dispatches to the right filler by ATS type
// ---------------------------------------------------------------------------

export async function fillApplicationForm(
  page: Page,
  atsType: DetectedAtsType,
  profile: UserProfile,
  onProgress: (msg: string) => void,
): Promise<FillResult> {
  switch (atsType) {
    case "greenhouse":
      return fillGreenhouse(page, profile, onProgress);
    case "lever":
      return fillLever(page, profile, onProgress);
    default:
      return fillGeneric(page, profile, onProgress);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try each selector in order, fill the first visible one. */
async function tryFill(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (!(await el.isVisible({ timeout: 2_000 }).catch(() => false))) continue;
      await el.fill(value, { timeout: 5_000 });
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

/** Select by visible text or value in a <select>. */
async function trySelect(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (!(await el.isVisible({ timeout: 2_000 }).catch(() => false))) continue;
      await el.selectOption({ label: value }, { timeout: 5_000 }).catch(async () => {
        await el.selectOption({ value }, { timeout: 5_000 });
      });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Greenhouse  (boards.greenhouse.io)
// ---------------------------------------------------------------------------

async function fillGreenhouse(
  page: Page,
  profile: UserProfile,
  onProgress: (msg: string) => void,
): Promise<FillResult> {
  onProgress("Filling Greenhouse application form...");

  let filled = 0;
  const skipped: string[] = [];

  // --- Standard identity fields ---
  const fields: Array<{ label: string; selectors: string[]; value: string | undefined }> = [
    {
      label: "first_name",
      selectors: ["#first_name", "input[name='job_application[first_name]']"],
      value: profile.firstName,
    },
    {
      label: "last_name",
      selectors: ["#last_name", "input[name='job_application[last_name]']"],
      value: profile.lastName,
    },
    {
      label: "email",
      selectors: ["#email", "input[name='job_application[email]']"],
      value: profile.email,
    },
    {
      label: "phone",
      selectors: ["#phone", "input[name='job_application[phone]']"],
      value: profile.phone,
    },
  ];

  for (const field of fields) {
    if (!field.value) {
      skipped.push(field.label);
      continue;
    }
    const ok = await tryFill(page, field.selectors, field.value);
    ok ? filled++ : skipped.push(field.label);
  }

  // --- LinkedIn URL (Greenhouse wraps custom questions in .field divs) ---
  if (profile.linkedinUrl) {
    const ok = await fillGreenhouseCustomField(page, "linkedin", profile.linkedinUrl);
    ok ? filled++ : skipped.push("linkedin_url");
  }

  // --- Website / portfolio ---
  if (profile.websiteUrl) {
    const ok = await fillGreenhouseCustomField(page, "website", profile.websiteUrl);
    ok ? filled++ : skipped.push("website_url");
  }

  // --- Cover letter textarea (plain text, not file upload) ---
  if (profile.bio || profile.headline) {
    const coverText = profile.bio || profile.headline || "";
    const ok = await tryFill(
      page,
      ["#cover_letter_text", "textarea[name='job_application[cover_letter_text]']"],
      coverText,
    );
    ok ? filled++ : skipped.push("cover_letter");
  }

  onProgress(`Greenhouse: filled ${filled} fields, skipped: ${skipped.join(", ") || "none"}`);

  return { fieldsAttempted: fields.length + 3, fieldsFilled: filled, skipped, submitted: false };
}

/**
 * Find a Greenhouse custom question field whose label contains the keyword
 * and fill its first text input or textarea.
 */
async function fillGreenhouseCustomField(
  page: Page,
  keyword: string,
  value: string,
): Promise<boolean> {
  try {
    const fieldDivs = page.locator(".field");
    const count = await fieldDivs.count();

    for (let i = 0; i < count; i++) {
      const div = fieldDivs.nth(i);
      const labelText = (await div.locator("label").first().textContent().catch(() => "")) ?? "";
      if (!labelText.toLowerCase().includes(keyword)) continue;

      const input = div.locator("input[type=text], textarea").first();
      if (await input.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await input.fill(value, { timeout: 5_000 });
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

// ---------------------------------------------------------------------------
// Lever  (jobs.lever.co)
// ---------------------------------------------------------------------------

async function fillLever(
  page: Page,
  profile: UserProfile,
  onProgress: (msg: string) => void,
): Promise<FillResult> {
  onProgress("Filling Lever application form...");

  let filled = 0;
  const skipped: string[] = [];

  // Lever uses input[name=...] for its standard fields
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || undefined;

  const fields: Array<{ label: string; selectors: string[]; value: string | undefined }> = [
    {
      label: "name",
      selectors: ["input[name=name]"],
      value: fullName,
    },
    {
      label: "email",
      selectors: ["input[name=email]"],
      value: profile.email,
    },
    {
      label: "phone",
      selectors: ["input[name=phone]"],
      value: profile.phone,
    },
    {
      label: "org",
      selectors: ["input[name=org]"],
      value: profile.employmentHistory?.[0]?.companyName,
    },
    {
      label: "linkedin",
      selectors: ["input[name='urls[LinkedIn]']", "input[placeholder*='linkedin' i]"],
      value: profile.linkedinUrl,
    },
    {
      label: "website",
      selectors: ["input[name='urls[Portfolio]']", "input[name='urls[Other]']"],
      value: profile.websiteUrl,
    },
    {
      label: "comments",
      selectors: ["textarea[name=comments]", "textarea[placeholder*='cover' i]"],
      value: profile.bio || profile.headline,
    },
  ];

  for (const field of fields) {
    if (!field.value) {
      skipped.push(field.label);
      continue;
    }
    const ok = await tryFill(page, field.selectors, field.value);
    ok ? filled++ : skipped.push(field.label);
  }

  // Lever custom questions — `[data-qa]` divs with label + input
  const customFilled = await fillLeverCustomQuestions(page, profile);
  filled += customFilled;

  onProgress(`Lever: filled ${filled} fields, skipped: ${skipped.join(", ") || "none"}`);

  return { fieldsAttempted: fields.length, fieldsFilled: filled, skipped, submitted: false };
}

async function fillLeverCustomQuestions(page: Page, profile: UserProfile): Promise<number> {
  let filled = 0;
  const profileText = buildProfileSummaryText(profile);

  try {
    const cards = page.locator(".application-additional-cards .application-question");
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const labelText = (
        (await card.locator("label, .application-label").first().textContent().catch(() => "")) ?? ""
      ).toLowerCase();

      // Skip resume/file uploads
      if (await card.locator("input[type=file]").count().then((n: number) => n > 0)) continue;

      const textarea = card.locator("textarea").first();
      if (await textarea.isVisible({ timeout: 1_000 }).catch(() => false)) {
        // For open-ended text questions, put a condensed profile summary
        if (labelText.includes("cover") || labelText.includes("motivation") || labelText.includes("why")) {
          await textarea.fill(profile.bio || profile.headline || profileText, { timeout: 5_000 });
          filled++;
        }
        continue;
      }

      const select = card.locator("select").first();
      if (await select.isVisible({ timeout: 1_000 }).catch(() => false)) {
        // e.g. work authorisation, visa sponsorship — skip selects we can't answer reliably
        continue;
      }
    }
  } catch {
    // ignore
  }

  return filled;
}

// ---------------------------------------------------------------------------
// Generic fallback — label-keyword matching
// ---------------------------------------------------------------------------

async function fillGeneric(
  page: Page,
  profile: UserProfile,
  onProgress: (msg: string) => void,
): Promise<FillResult> {
  onProgress("Filling application form (generic mode)...");

  // Map of keyword → profile value
  const mappings: Array<{ keywords: string[]; value: string | undefined; type?: "select" }> = [
    { keywords: ["first name", "firstname", "given name"], value: profile.firstName },
    { keywords: ["last name", "lastname", "surname", "family name"], value: profile.lastName },
    {
      keywords: ["full name", "your name", "name"],
      value: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || undefined,
    },
    { keywords: ["email", "e-mail"], value: profile.email },
    { keywords: ["phone", "mobile", "telephone", "contact number"], value: profile.phone },
    { keywords: ["location", "city", "where are you based"], value: profile.location },
    { keywords: ["current company", "current employer", "company"], value: profile.employmentHistory?.[0]?.companyName },
    { keywords: ["current role", "current title", "job title", "position"], value: profile.employmentHistory?.[0]?.title || profile.title },
    { keywords: ["linkedin", "linkedin url", "linkedin profile"], value: profile.linkedinUrl },
    { keywords: ["website", "portfolio", "personal site"], value: profile.websiteUrl },
    { keywords: ["cover letter", "motivation", "why are you", "tell us about yourself"], value: profile.bio || profile.headline },
  ];

  let filled = 0;
  const skipped: string[] = [];

  // Gather all visible form inputs, textareas, selects
  const inputs = page.locator(
    "input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea",
  );
  const count = await inputs.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i);
    if (!(await el.isVisible({ timeout: 1_000 }).catch(() => false))) continue;

    // Get identifying text: label, placeholder, name, id, aria-label
    const [placeholder, name, id, ariaLabel] = await Promise.all([
      el.getAttribute("placeholder").catch(() => ""),
      el.getAttribute("name").catch(() => ""),
      el.getAttribute("id").catch(() => ""),
      el.getAttribute("aria-label").catch(() => ""),
    ]);

    // Find associated <label> text via id
    let labelText = "";
    if (id) {
      labelText = (await page.locator(`label[for="${id}"]`).first().textContent().catch(() => "")) ?? "";
    }

    const combined = [placeholder, name, id, ariaLabel, labelText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const mapping of mappings) {
      if (!mapping.value) continue;
      if (mapping.keywords.some((kw) => combined.includes(kw))) {
        const ok = await el.fill(mapping.value, { timeout: 5_000 }).then(() => true).catch(() => false);
        if (ok) {
          filled++;
          break;
        }
      }
    }
  }

  if (filled === 0) skipped.push("no matching fields found");

  onProgress(`Generic: filled ${filled} fields`);

  return { fieldsAttempted: count, fieldsFilled: filled, skipped, submitted: false };
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function buildProfileSummaryText(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.headline) parts.push(profile.headline);
  if (profile.bio) parts.push(profile.bio);
  if (profile.skills?.length) {
    parts.push(`Skills: ${profile.skills.map((s) => s.name).join(", ")}`);
  }
  return parts.join("\n\n");
}

// Re-export for pipeline use
export { tryFill, trySelect };
