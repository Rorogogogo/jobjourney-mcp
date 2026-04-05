import Anthropic from "@anthropic-ai/sdk";
import { type ExtractedField, type PageContext } from "./dom-extractor.js";
import { type UserProfile } from "./profile-loader.js";

export interface FillAction {
  action: "fill" | "select" | "check" | "skip";
  index: number;
  value: string;
  reason?: string;
}

export interface FillPlan {
  actions: FillAction[];
  confidence: "high" | "medium" | "low";
  notes?: string;
}

const SYSTEM_PROMPT = `You are an expert job application form filler. Given a list of form fields and a user's profile, produce a JSON action plan to fill the form.

Rules:
- Return ONLY valid JSON, no markdown fences, no explanation outside JSON.
- For each field that can be filled from the profile, emit a "fill" or "select" action.
- For checkboxes that should be checked, use "check" with value "true".
- For file upload fields, emit "skip" with reason "file upload handled separately".
- For fields you cannot determine from the profile, emit "skip" with a brief reason.
- Match select/radio options by closest semantic match, not exact string.
- For cover letter or "why do you want this job" fields, write 2-3 sentences using the profile's experience.
- Keep values professional and concise.
- Index refers to the field's position in the provided list (0-based).

Response schema:
{
  "actions": [
    { "action": "fill"|"select"|"check"|"skip", "index": number, "value": string, "reason"?: string }
  ],
  "confidence": "high"|"medium"|"low",
  "notes": "optional notes about fields that need human review"
}`;

function formatFieldList(fields: ExtractedField[]): string {
  return fields
    .map((f, i) => {
      let line = `[${i}] <${f.type} label="${f.label}"`;
      if (f.placeholder) line += ` placeholder="${f.placeholder}"`;
      if (f.required) line += " required";
      if (f.options.length > 0) line += ` options=${JSON.stringify(f.options)}`;
      if (f.currentValue) line += ` value="${f.currentValue}"`;
      if (f.fieldGroup) line += ` group="${f.fieldGroup}"`;
      line += " />";
      return line;
    })
    .join("\n");
}

function formatProfile(profile: UserProfile): string {
  const sections: string[] = [];

  if (profile.firstName || profile.lastName) {
    sections.push(`Name: ${[profile.firstName, profile.lastName].filter(Boolean).join(" ")}`);
  }
  if (profile.email) sections.push(`Email: ${profile.email}`);
  if (profile.phone) sections.push(`Phone: ${profile.phone}`);
  if (profile.title) sections.push(`Title: ${profile.title}`);
  if (profile.location) sections.push(`Location: ${profile.location}`);
  if (profile.linkedinUrl) sections.push(`LinkedIn: ${profile.linkedinUrl}`);
  if (profile.websiteUrl) sections.push(`Website: ${profile.websiteUrl}`);
  if (profile.githubUrl) sections.push(`GitHub: ${profile.githubUrl}`);
  if (profile.workAuthorization) sections.push(`Work Authorization: ${profile.workAuthorization}`);
  if (profile.requiresSponsorship !== undefined) sections.push(`Requires Sponsorship: ${profile.requiresSponsorship ? "Yes" : "No"}`);
  if (profile.bio) sections.push(`Summary: ${profile.bio}`);

  // Address
  const addrParts = [profile.street, profile.city, profile.state, profile.zipCode, profile.country].filter(Boolean);
  if (addrParts.length > 0) sections.push(`Address: ${addrParts.join(", ")}`);

  // Salary
  if (profile.salaryMin || profile.salaryMax) {
    const cur = profile.salaryCurrency || "AUD";
    const period = profile.salaryPeriod || "annual";
    sections.push(`Salary Expectation: ${cur} ${profile.salaryMin || "?"}-${profile.salaryMax || "?"} (${period})`);
  }

  // Availability
  if (profile.noticePeriod) sections.push(`Notice Period: ${profile.noticePeriod}`);
  if (profile.availableFrom) sections.push(`Available From: ${profile.availableFrom}`);

  // Additional
  if (profile.preferredName) sections.push(`Preferred Name: ${profile.preferredName}`);
  if (profile.pronouns) sections.push(`Pronouns: ${profile.pronouns}`);
  if (profile.nationality) sections.push(`Nationality: ${profile.nationality}`);
  if (profile.citizenship) sections.push(`Citizenship: ${profile.citizenship}`);
  if (profile.dateOfBirth) sections.push(`Date of Birth: ${profile.dateOfBirth}`);
  if (profile.defaultHowDidYouHear) sections.push(`How Did You Hear: ${profile.defaultHowDidYouHear}`);

  // EEO
  if (profile.gender) sections.push(`Gender: ${profile.gender}`);
  if (profile.ethnicity) sections.push(`Ethnicity: ${profile.ethnicity}`);
  if (profile.disabilityStatus) sections.push(`Disability Status: ${profile.disabilityStatus}`);
  if (profile.veteranStatus) sections.push(`Veteran Status: ${profile.veteranStatus}`);

  if (profile.skills?.length) {
    sections.push(`Skills: ${profile.skills.map((s) => s.name).join(", ")}`);
  }

  if (profile.employmentHistory?.length) {
    sections.push("Employment:");
    for (const job of profile.employmentHistory) {
      let line = `  - ${job.title} at ${job.companyName}`;
      if (job.startDate) line += ` (${job.startDate}–${job.endDate || "present"})`;
      sections.push(line);
      if (job.bulletPoints?.length) {
        for (const bp of job.bulletPoints.slice(0, 3)) {
          sections.push(`    * ${bp}`);
        }
      }
    }
  }

  if (profile.education?.length) {
    sections.push("Education:");
    for (const edu of profile.education) {
      let line = `  - ${edu.degree}`;
      if (edu.fieldOfStudy) line += ` in ${edu.fieldOfStudy}`;
      line += ` at ${edu.institution}`;
      if (edu.startDate) line += ` (${edu.startDate}–${edu.endDate || "present"})`;
      sections.push(line);
    }
  }

  return sections.join("\n");
}

export async function buildFillPlan(
  fields: ExtractedField[],
  profile: UserProfile,
  pageContext?: PageContext,
  jobContext?: { title?: string; company?: string; description?: string },
): Promise<FillPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable required for smart form filling. " +
      "Set it when configuring the MCP plugin."
    );
  }

  const client = new Anthropic({ apiKey });

  let userPrompt = `## Form Fields\n${formatFieldList(fields)}\n\n## User Profile\n${formatProfile(profile)}`;

  if (pageContext) {
    userPrompt += `\n\n## Page Context\nTitle: ${pageContext.pageTitle}`;
    if (pageContext.stepIndicator) userPrompt += `\nStep: ${pageContext.stepIndicator}`;
    if (pageContext.errorMessages.length > 0) {
      userPrompt += `\nErrors: ${pageContext.errorMessages.join("; ")}`;
    }
  }

  if (jobContext) {
    userPrompt += "\n\n## Job Context";
    if (jobContext.title) userPrompt += `\nJob Title: ${jobContext.title}`;
    if (jobContext.company) userPrompt += `\nCompany: ${jobContext.company}`;
    if (jobContext.description) userPrompt += `\nDescription: ${jobContext.description.slice(0, 500)}`;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip markdown fences if the model wraps them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  const parsed = JSON.parse(cleaned) as FillPlan;

  // Validate indices are in range
  parsed.actions = parsed.actions.filter((a) => a.index >= 0 && a.index < fields.length);

  return parsed;
}
