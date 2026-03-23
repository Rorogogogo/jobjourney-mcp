# AI-Driven Auto-Apply via MCP Tools

## Overview

Replace the hardcoded form-filling pipeline with AI-driven MCP tools. Claude (the MCP host) orchestrates job application form filling by calling tools to open pages, extract form structure, fill fields, upload resumes, and navigate multi-step forms. No preset CSS selectors — the AI analyzes each form dynamically.

## Architecture

```
User: "Apply to this job at [url]"
    │
    ▼
Claude (AI Agent)
    │
    ├── calls get_profile() → gets user data + visa status
    ├── calls get_documents(type: "cvs") → finds primary CV
    ├── calls open_application_page(url) → browser opens, resolves aggregator if needed
    │
    │   ┌─── LOOP (handles multi-step forms) ───┐
    │   │                                         │
    │   ├── calls extract_form_fields()           │
    │   │   → returns structured field list       │
    │   │                                         │
    │   ├── Claude analyzes fields vs profile     │
    │   │   → decides what goes where             │
    │   │                                         │
    │   ├── calls fill_form_field() × N           │
    │   ├── calls select_form_option() × N        │
    │   ├── calls upload_resume(documentId)       │
    │   │                                         │
    │   ├── calls extract_form_fields() again     │
    │   │   → confirms fields are filled          │
    │   │                                         │
    │   ├── tells user: "Here's what I filled,    │
    │   │   ready to go to next step / submit?"   │
    │   │                                         │
    │   └── calls click_element(nextBtn) ─────────┘
    │
    ├── User confirms submit
    ├── calls click_element(submitBtn)
    └── calls close_browser()
```

### Key Principles

- **Claude is the brain** — reads the form, maps fields to profile data, handles edge cases conversationally.
- **Browser session persists** across tool calls within the same conversation.
- **No hardcoded selectors** — works on any site (ATS or company career page).
- **No auto-submit** — Claude shows what it filled and asks for confirmation before clicking submit.

## MCP Tools

### Browser Management

#### `open_application_page(url: string)`
- Detects if URL is an aggregator (LinkedIn/Seek/Indeed).
- If so, uses saved cookies to click "Apply" and follow the redirect (reuses existing `resolveApplyUrl` logic).
- Opens the resolved page in the persistent browser.
- Returns: `{ resolvedUrl, pageTitle }`.

#### `close_browser()`
- Closes the browser session and cleans up all state.
- No parameters.

### Form Interaction

#### `extract_form_fields()`
- Scans the current page for all visible form elements.
- For each field returns:
  ```json
  {
    "selector": "string — unique CSS selector",
    "type": "text | email | tel | textarea | select | radio | checkbox | file",
    "label": "string — associated label text",
    "placeholder": "string",
    "required": "boolean",
    "currentValue": "string",
    "options": ["string[] — for select/radio only"],
    "fieldGroup": "string — nearest fieldset/section heading"
  }
  ```
- Also returns page-level context: title, step indicators, visible error messages.
- Skips hidden inputs, submit buttons, invisible elements, honeypot fields.
- Label resolution: `<label for=...>` → parent `<label>` → `aria-label` → `aria-labelledby` → nearby text.
- Selector generation: prefers `#id`, then `[name=...]`, then nth-child path.

#### `fill_form_field(selector: string, value: string)`
- Fills a single text/email/tel/textarea input.
- Returns: `{ success, filledValue }`.

#### `select_form_option(selector: string, value: string)`
- Selects an option in a dropdown, radio group, or checkbox.
- Tries matching by label text first, then by value.
- Returns: `{ success, selectedOption }`.

#### `upload_resume(selector: string, documentId?: string)`
- If no `documentId`, fetches the primary CV from the API (`isPrimary` flag).
- Downloads the file from Google Drive `fileUrl` to a temp path.
- Uses `page.setInputFiles()` to upload.
- Cleans up temp file after upload.
- Returns: `{ success, fileName }`.

#### `click_element(selector: string, description?: string)`
- Clicks a button/link (for "Next", "Submit", "Continue", etc.).
- `description` is optional, for logging.
- Returns: `{ success, newUrl }` — so Claude knows if the page navigated.

### Diagnostic

#### `take_page_screenshot()`
- Takes a screenshot of the current page.
- Returns the image for Claude to visually inspect.
- Useful for CAPTCHAs, unusual layouts, or verifying form state.

## Browser Session Management

### Singleton Pattern

Module-level state:
- `activeBrowser: Browser | null`
- `activePage: Page | null`
- `activeContext: BrowserContext | null`

### Lifecycle

- `open_application_page` → creates browser + context + page if none exists. If one already exists, navigates the existing page to the new URL.
- All other tools → read from `activePage`. If null, return error: "No page open. Call open_application_page first."
- `close_browser` → closes everything, sets all to null.
- MCP disconnect → cleanup hook closes the browser if still open to prevent orphaned Chrome processes.

### Authenticated Context

- If URL is an aggregator site, use `createAuthenticatedContext()` with saved cookies.
- For direct ATS/company URLs, use a plain browser context.

### Error Recovery

- If browser crashes or user closes Chrome, next tool call detects the dead browser via `isBrowserClosedError()` and returns: "Browser was closed. Call open_application_page to start again."

## DOM Extraction Strategy

### Per-Field Extraction

1. Query all visible `input`, `textarea`, `select`, and elements with `role="radio"` or `role="checkbox"`.
2. Filter out `type=hidden`, `type=submit`, invisible elements, honeypot fields.
3. For each element extract: selector, type, label, placeholder, required, currentValue, options, fieldGroup.
4. Selector uniqueness: `#id` > `[name=...]` > positional nth-child path.
5. Label resolution: `label[for]` > parent `<label>` > `aria-label` > `aria-labelledby` > nearby text content.
6. Field grouping: walk up to nearest `<fieldset>` legend or section heading (h1-h4).

### Page-Level Context

- Page title.
- Step indicators (e.g. "Step 2 of 4").
- Visible error messages (so Claude can correct after a failed fill).

### Token Budget

Typical form: 10-30 fields × ~50-80 tokens each = ~2k tokens. Well within budget. No truncation needed for normal forms.

## Backend Changes

### 1. Primary CV Flag

**Entity:** Add `IsPrimary` (bool, default false) to `StoredDocument`.

**Migration:** Add column to `StoredDocuments` table.

**New endpoint:** `PUT /api/document/{id}/set-primary`
- Sets `IsPrimary = true` on the target document.
- Sets `IsPrimary = false` on all other CVs for that user.
- Only applies to documents of type `CV`.

**DTO change:** Include `isPrimary` in document response DTOs.

### 2. Work Authorization on Profile

**Entity:** Add `WorkAuthorization` (string, nullable) to `UserProfile`.

**Expected values:** `"Citizen"`, `"Permanent Resident"`, `"Work Visa"`, `"Student Visa"`, `"Require Sponsorship"`, `"Other"`.

**Migration:** Add column to `UserProfiles` table.

**DTO change:** Add `WorkAuthorization` to `UserProfileResponseDto` and update profile request DTOs.

### Plugin-Side Profile Changes

- `profile-loader.ts`: add `workAuthorization` to `UserProfile` interface and `ApiProfileResponse` mapping.
- New MCP tool: `set_default_cv(documentId)` — calls the new backend endpoint.
- Update `get_documents` response to show which CV is primary.

## File Structure

### New Files

```
src/auto-apply/
  browser-session.ts      — singleton browser/page/context management
  dom-extractor.ts        — extract_form_fields logic
  tools.ts                — register all auto-apply MCP tools
```

### Modified Files

```
src/index.ts                        — register auto-apply tools
src/auto-apply/profile-loader.ts    — add workAuthorization field
src/auto-apply/resolve-apply-url.ts — keep as-is, used by open_application_page
```

### Removed Files

```
src/auto-apply/form-filler.ts      — replaced by AI-driven tool calls
src/auto-apply/pipeline.ts         — replaced by agent orchestration
```

### Modified (SignalR)

```
src/agent/signalr-client.ts        — remove TriggerAutoApply handler + pipeline import
```

## Out of Scope

- Auto-submit without user confirmation.
- CAPTCHA solving.
- Two-factor auth handling on job sites.
- Cover letter generation per job (user can do this manually via existing tools before applying).
