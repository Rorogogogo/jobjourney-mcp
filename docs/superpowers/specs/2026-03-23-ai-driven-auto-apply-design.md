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
    ├── calls get_profile() → gets user data + visa status + work authorization
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
- **stdio transport only** — browser session is a process-level singleton. For httpStream (multi-user), a session-keyed map would be needed (out of scope for now).

## MCP Tools

### Browser Management

#### `open_application_page(url: string)`
- Detects if URL is an aggregator (LinkedIn/Seek/Indeed).
- If so, uses saved cookies to click "Apply" and follow the redirect (reuses existing `resolveApplyUrl` logic).
- Opens the resolved page in the persistent browser.
- Waits for DOM to settle (`networkidle` or short settle delay) before returning.
- Returns: `{ resolvedUrl, pageTitle }`.
- Throws if browser launch fails.

#### `close_browser()`
- Closes the browser session and cleans up all state.
- No parameters.
- No-op if no browser is open.

### Form Interaction

#### `extract_form_fields()`
- Scans the current page for all visible form elements, including those inside iframes (using Playwright `frameLocator` for frame discovery).
- Waits for DOM stability (short settle delay) before extraction to handle dynamically loaded forms.
- For each field returns:
  ```json
  {
    "selector": "string — unique CSS selector (shadow-piercing via Playwright >> syntax if needed)",
    "type": "text | email | tel | textarea | select | radio | checkbox | file",
    "label": "string — associated label text",
    "placeholder": "string",
    "required": "boolean",
    "currentValue": "string",
    "options": ["string[] — for select/radio only"],
    "fieldGroup": "string | null — nearest fieldset/section heading, null if none found"
  }
  ```
- Also returns page-level context: title, step indicators (e.g. "Step 2 of 4"), visible error messages.
- Skips hidden inputs, submit buttons, invisible elements, honeypot fields.
- Label resolution: `<label for=...>` → parent `<label>` → `aria-label` → `aria-labelledby` → nearby text.
- Selector generation: prefers `#id`, then `[name=...]`, then nth-child path. Uses Playwright `>>` chaining for shadow DOM elements.
- Throws if no page is open.

#### `fill_form_field(selector: string, value: string)`
- Fills a single text/email/tel/textarea input.
- Uses Playwright `fill()` first. If the field's value doesn't match after fill (React/Angular controlled inputs), falls back to `click()` + `keyboard.type()` to trigger framework-level state updates.
- Returns: `{ success, filledValue }`.
- Throws if no page is open or selector not found.

#### `select_form_option(selector: string, value: string)`
- Selects an option in a dropdown, radio group, or checkbox.
- Tries matching by label text first, then by value.
- Returns: `{ success, selectedOption }`.
- Throws if no page is open or selector not found.

#### `upload_resume(selector: string, documentId?: string)`
- If no `documentId`, fetches the user's CVs from the API and picks the one with `isPrimary = true`. If none is primary, uses the most recent.
- Downloads the file from the document's `fileUrl` (Google Drive download link) to a temp path.
- Uses `page.setInputFiles()` to upload.
- Cleans up temp file in a `try/finally` block — always deleted regardless of success or failure.
- Returns: `{ success, fileName }`.
- Throws if no page is open, no CVs exist, or download fails.

#### `click_element(selector: string, description?: string)`
- Clicks a button/link (for "Next", "Submit", "Continue", etc.).
- `description` is optional, for logging.
- After clicking, waits briefly for navigation or DOM changes.
- Returns: `{ success, newUrl, pageChanged }` — `pageChanged` is true if the URL changed or new form fields appeared (handles SPA in-page navigation).
- Throws if no page is open or selector not found.

### Document Management

#### `set_default_cv(documentId: string)`
- Calls `PUT /api/document/{id}/set-primary` to mark a CV as the default for auto-apply.
- Returns: `{ success, documentName }`.
- Throws if the document doesn't exist or isn't a CV.

### Diagnostic

#### `take_page_screenshot()`
- Takes a screenshot of the current page.
- Returns the image for Claude to visually inspect.
- Useful for CAPTCHAs, unusual layouts, or verifying form state.
- Throws if no page is open.

## Browser Session Management

### Singleton Pattern

Module-level state:
- `activeBrowser: Browser | null`
- `activePage: Page | null`
- `activeContext: BrowserContext | null`

**Transport constraint:** This singleton is process-scoped, which is safe for stdio transport (one user per process). For httpStream transport (multi-user), a session-keyed map (keyed on `context.session.apiKey`) would be required. httpStream support is out of scope for now.

### Lifecycle

- `open_application_page` → creates browser + context + page if none exists. If one already exists, navigates the existing page to the new URL (awaits navigation + DOM settle before returning).
- All other tools → read from `activePage`. If null, throw: "No page open. Call open_application_page first."
- `close_browser` → closes everything, sets all to null.
- Process exit cleanup → register `process.on('exit')` and `process.on('SIGINT')` handlers to close the browser, preventing orphaned Chrome processes in stdio mode.

### Concurrency

MCP tool calls from the agent are sequential (not parallel). There is no concurrent access to the browser session. If this assumption changes in the future, a mutex/lock would be needed.

### Authenticated Context

- If URL is an aggregator site, use `createAuthenticatedContext()` with saved cookies.
- For direct ATS/company URLs, use a plain browser context.

### Error Recovery

- If browser crashes or user closes Chrome, next tool call detects the dead browser via `isBrowserClosedError()` and throws: "Browser was closed. Call open_application_page to start again."
- All tool errors are thrown as exceptions. FastMCP surfaces these to the agent as error responses, allowing Claude to handle them conversationally.

## DOM Extraction Strategy

### Per-Field Extraction

1. Query all visible `input`, `textarea`, `select`, and elements with `role="radio"` or `role="checkbox"`.
2. Discover iframes on the page and recurse into them using Playwright `frameLocator`. Prefix iframe field selectors with the frame locator path.
3. Use Playwright's shadow-piercing locators (`>>`) to find fields inside shadow DOM (common in Workday, Angular-based ATS).
4. Filter out `type=hidden`, `type=submit`, invisible elements, honeypot fields.
5. For each element extract: selector, type, label, placeholder, required, currentValue, options, fieldGroup.
6. Selector uniqueness: `#id` > `[name=...]` > positional nth-child path. Use `>>` chaining for shadow DOM.
7. Label resolution: `label[for]` > parent `<label>` > `aria-label` > `aria-labelledby` > nearby text content.
8. Field grouping: walk up to nearest `<fieldset>` legend or section heading (h1-h4). Return `null` if none found.

### DOM Stability

Before extracting, wait for DOM to settle:
- Use `page.waitForLoadState('networkidle')` with a short timeout (5s).
- If that times out, fall back to a 1s fixed delay.
- This handles dynamically loaded forms (e.g. multi-section Workday pages).

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

**DTO change:** Include `isPrimary` and `fileUrl` in document list/detail response DTOs. (`fileUrl` is already stored on `StoredDocument` but not currently exposed in list responses — needed for the plugin to download the file.)

### 2. Work Authorization on Profile

**Entity:** Add `WorkAuthorization` (string, nullable) to `UserProfile`.

Stored as a free-form string to allow flexible matching against varied ATS dropdown labels. Common values: `"Citizen"`, `"Permanent Resident"`, `"Work Visa"`, `"Student Visa"`, `"Require Sponsorship"`, `"Other"`.

**Migration:** Add column to `UserProfiles` table.

**DTO change:** Add `WorkAuthorization` to `UserProfileResponseDto` and update profile request DTOs.

### Plugin-Side Profile Changes

- `profile-loader.ts`: add `workAuthorization` to `UserProfile` interface and `ApiProfileResponse` mapping.
- Update `get_documents` response to show which CV is primary.

## File Structure

### New Files

```
src/auto-apply/
  browser-session.ts      — singleton browser/page/context management + process exit cleanup
  dom-extractor.ts        — extract_form_fields logic (iframe/shadow DOM handling)
  tools.ts                — register all auto-apply MCP tools (8 tools)
```

### Modified Files

```
src/index.ts                        — register auto-apply tools
src/auto-apply/profile-loader.ts    — add workAuthorization field
src/auto-apply/resolve-apply-url.ts — keep as-is, used by open_application_page
src/tools/documents.ts              — show isPrimary in get_documents response
```

### Removed Files

```
src/auto-apply/form-filler.ts      — replaced by AI-driven tool calls
src/auto-apply/pipeline.ts         — replaced by agent orchestration
```

### Modified (SignalR)

```
src/agent/signalr-client.ts        — replace TriggerAutoApply handler with a deprecation
                                      warning log (keep handler until backend stops sending
                                      the event, then remove in a follow-up)
```

## Out of Scope

- Auto-submit without user confirmation.
- CAPTCHA solving.
- Two-factor auth handling on job sites.
- Cover letter generation per job (user can do this manually via existing tools before applying).
- httpStream multi-user browser session management.
