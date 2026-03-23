# AI-Driven Auto-Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded form-filling pipeline with MCP tools that Claude orchestrates to fill job application forms on any website.

**Architecture:** Persistent browser session (singleton) managed by MCP tools. Claude extracts form structure via DOM analysis, maps fields to user profile, and fills them via individual tool calls. Backend adds `IsPrimary` flag on CVs and `WorkAuthorization` on user profiles.

**Tech Stack:** TypeScript, Playwright, FastMCP (Zod schemas), .NET 9 (EF Core migrations), Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-ai-driven-auto-apply-design.md`

---

## File Map

### Plugin (jobjourney-claude-plugin)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/auto-apply/browser-session.ts` | Create | Singleton browser/page/context lifecycle, process exit cleanup, error detection |
| `src/auto-apply/dom-extractor.ts` | Create | Extract form fields from page DOM (iframe/shadow DOM support, label resolution, selector generation) |
| `src/auto-apply/tools.ts` | Create | Register all 9 auto-apply MCP tools |
| `src/auto-apply/profile-loader.ts` | Modify | Add `workAuthorization` to interfaces and mapping |
| `src/auto-apply/resolve-apply-url.ts` | Keep | Reused by `open_application_page` |
| `src/auto-apply/form-filler.ts` | Delete | Replaced by AI-driven tools |
| `src/auto-apply/pipeline.ts` | Delete | Replaced by agent orchestration |
| `src/agent/signalr-client.ts` | Modify | Deprecation warning for TriggerAutoApply |
| `src/tools/documents.ts` | Modify | Show `isPrimary` and `fileUrl` in responses |
| `src/index.ts` | Modify | Register auto-apply tools |
| `tests/auto-apply/browser-session.test.ts` | Create | Browser session lifecycle tests |
| `tests/auto-apply/dom-extractor.test.ts` | Create | DOM extraction tests |
| `tests/auto-apply/tools.test.ts` | Create | MCP tool registration and execution tests |

### Backend (JobJourney)

| File | Action | Responsibility |
|------|--------|----------------|
| `Domain/Entities/StoredDocument.cs` | Modify | Add `IsPrimary` property |
| `Domain/Entities/ApplicationUser.cs` | Modify | Add `WorkAuthorization` property |
| `Application/Dtos/Response/Documents/DocumentResponseDtos.cs` | Modify | Add `IsPrimary` to `StoredDocumentDto` |
| `Application/Dtos/Response/Users/UserProfileResponseDto.cs` | Modify | Add `WorkAuthorization` |
| `Application/Dtos/Request/Profile/UserProfileUpdateRequestDto.cs` | Modify | Add `WorkAuthorization` |
| `Application/Services/Documents/IDocumentAppService.cs` | Modify | Add `SetPrimaryAsync` method |
| `Application/Services/Documents/DocumentAppService.cs` | Modify | Implement `SetPrimaryAsync` |
| `Application/Mappings/DocumentMappings.cs` | Modify | Add `IsPrimary` to `ToDto()` mapping |
| `API/Controllers/DocumentController.cs` | Modify | Add `PUT {id}/set-primary` endpoint |
| `Infrastructure/Data/Migrations/` | Create | Two migrations for `IsPrimary` and `WorkAuthorization` |

---

## Task 1: Backend — Add `IsPrimary` to StoredDocument

**Files:**
- Modify: `JobJourney/Backend/src/JobJourney.Domain/Entities/StoredDocument.cs`
- Modify: `JobJourney/Backend/src/JobJourney.Application/Dtos/Response/Documents/DocumentResponseDtos.cs`
- Modify: `JobJourney/Backend/src/JobJourney.Application/Services/Documents/IDocumentAppService.cs`
- Modify: `JobJourney/Backend/src/JobJourney.Application/Services/Documents/DocumentAppService.cs`
- Modify: `JobJourney/Backend/src/JobJourney.API/Controllers/DocumentController.cs`
- Create: Migration

- [ ] **Step 1: Add `IsPrimary` to entity**

In `StoredDocument.cs`, add after `FileId`:
```csharp
public bool IsPrimary { get; set; }
```

- [ ] **Step 2: Add `IsPrimary` to DTO**

In `DocumentResponseDtos.cs`, add to `StoredDocumentDto`:
```csharp
public bool IsPrimary { get; set; }
```

- [ ] **Step 3: Add `SetPrimaryAsync` to service interface**

In `IDocumentAppService.cs`, add:
```csharp
Task<ApiResponseWithDataDto<StoredDocumentDto>> SetPrimaryAsync(Guid documentId);
```

- [ ] **Step 4: Implement `SetPrimaryAsync` in service**

In `DocumentAppService.cs`, add method that:
1. Gets the document by ID, validates it belongs to current user and is of type `CV`
2. Sets `IsPrimary = false` on all other CVs for that user
3. Sets `IsPrimary = true` on the target document
4. Saves changes
5. Returns the updated document DTO

```csharp
public async Task<ApiResponseWithDataDto<StoredDocumentDto>> SetPrimaryAsync(Guid documentId)
{
    var userId = _currentUser.GetCurrentUserId();
    var document = await _unitOfWork.Documents.GetByIdAsync(documentId);
    if (document == null || document.UserId != userId)
    {
        return new ApiResponseWithDataDto<StoredDocumentDto>
        {
            ErrorCode = ErrorCodes.NotFound,
            Message = "Document not found"
        };
    }

    if (document.DocumentType != DocumentType.CV)
    {
        return new ApiResponseWithDataDto<StoredDocumentDto>
        {
            ErrorCode = "INVALID_TYPE",
            Message = "Only CVs can be set as primary"
        };
    }

    // Clear existing primary on all user CVs
    var userCvs = await _unitOfWork.Documents.GetUserDocumentsAsync(userId, DocumentType.CV);
    foreach (var cv in userCvs)
    {
        if (cv.IsPrimary)
        {
            cv.IsPrimary = false;
            _unitOfWork.Documents.Update(cv);
        }
    }

    document.IsPrimary = true;
    _unitOfWork.Documents.Update(document);
    await _unitOfWork.SaveChangesAsync();

    return new ApiResponseWithDataDto<StoredDocumentDto>
    {
        Data = document.ToDto(),
        Message = "CV set as primary"
    };
}
```

- [ ] **Step 5: Add controller endpoint**

In `DocumentController.cs`, add:
```csharp
[HttpPut("{id:guid}/set-primary")]
public async Task<ActionResult<ApiResponseWithDataDto<StoredDocumentDto>>> SetPrimary(Guid id)
{
    var response = await _documentAppService.SetPrimaryAsync(id);
    return response.IsSuccess ? Ok(response) : BadRequest(response);
}
```

- [ ] **Step 6: Add `IsPrimary` to DTO mapping**

In `Application/Mappings/DocumentMappings.cs`, add to the `ToDto()` extension method:
```csharp
IsPrimary = document.IsPrimary,
```

- [ ] **Step 7: Create migration**

```bash
cd JobJourney/Backend
dotnet ef migrations add AddIsPrimaryToStoredDocuments --project src/JobJourney.Infrastructure --startup-project src/JobJourney.API
```

- [ ] **Step 8: Build and verify**

```bash
cd JobJourney/Backend
dotnet build
dotnet test
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(backend): add IsPrimary flag to StoredDocument with set-primary endpoint"
```

---

## Task 2: Backend — Add `WorkAuthorization` to User Profile

Note: The spec refers to "UserProfile entity" — in the backend, profile fields live directly on `ApplicationUser` (there is no separate UserProfile entity).

**Files:**
- Modify: `JobJourney/Backend/src/JobJourney.Domain/Entities/ApplicationUser.cs`
- Modify: `JobJourney/Backend/src/JobJourney.Application/Dtos/Response/Users/UserProfileResponseDto.cs`
- Modify: `JobJourney/Backend/src/JobJourney.Application/Dtos/Request/Profile/UserProfileUpdateRequestDto.cs`
- Create: Migration

- [ ] **Step 1: Add property to entity**

In `ApplicationUser.cs`, add after `Summary`:
```csharp
public string? WorkAuthorization { get; set; }
```

- [ ] **Step 2: Add to response DTO**

In `UserProfileResponseDto.cs`, add to `UserProfileResponseDto`:
```csharp
public string? WorkAuthorization { get; set; }
```

- [ ] **Step 3: Add to request DTO**

In `UserProfileUpdateRequestDto.cs`, add to `UserProfileUpdateRequestDto`:
```csharp
public string? WorkAuthorization { get; set; }
```

- [ ] **Step 4: Update profile service mapping**

Find the profile service that maps `UserProfileUpdateRequestDto` → `ApplicationUser` and add `WorkAuthorization` to the mapping. Also ensure the `ApplicationUser` → `UserProfileResponseDto` mapping includes it.

- [ ] **Step 5: Create migration**

```bash
cd JobJourney/Backend
dotnet ef migrations add AddWorkAuthorizationToApplicationUser --project src/JobJourney.Infrastructure --startup-project src/JobJourney.API
```

- [ ] **Step 6: Build and verify**

```bash
cd JobJourney/Backend
dotnet build
dotnet test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(backend): add WorkAuthorization field to user profile"
```

---

## Task 3: Plugin — Browser Session Manager

**Files:**
- Create: `src/auto-apply/browser-session.ts`
- Create: `tests/auto-apply/browser-session.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/auto-apply/browser-session.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset module between tests to avoid singleton state bleed
beforeEach(() => {
  vi.resetModules();
});

describe("BrowserSession", () => {
  it("getActivePage returns null when no session exists", async () => {
    const { getActivePage } = await import("../../src/auto-apply/browser-session.js");
    expect(getActivePage()).toBeNull();
  });

  it("closeBrowserSession is a no-op when no session exists", async () => {
    const { closeBrowserSession } = await import("../../src/auto-apply/browser-session.js");
    // Should not throw
    await closeBrowserSession();
  });

  it("requireActivePage throws when no session exists", async () => {
    const { requireActivePage } = await import("../../src/auto-apply/browser-session.js");
    expect(() => requireActivePage()).toThrow("No page open");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/auto-apply/browser-session.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement browser-session.ts**

Create `src/auto-apply/browser-session.ts`:

```typescript
import { type Browser, type BrowserContext, type Page } from "playwright";
import {
  launchBrowser,
  createAuthenticatedContext,
  isBrowserClosedError,
} from "../scraper/core/browser.js";
import { detectAggregator } from "./resolve-apply-url.js";

let activeBrowser: Browser | null = null;
let activeContext: BrowserContext | null = null;
let activePage: Page | null = null;

/**
 * Returns the active Browser instance, or null if no session exists.
 */
export function getActiveBrowser(): Browser | null {
  return activeBrowser;
}

/**
 * Returns the active Playwright Page, or null if no session exists.
 */
export function getActivePage(): Page | null {
  if (activePage && !activePage.isClosed()) return activePage;
  activePage = null;
  return null;
}

/**
 * Returns the active page or throws if none exists.
 */
export function requireActivePage(): Page {
  const page = getActivePage();
  if (!page) {
    throw new Error("No page open. Call open_application_page first.");
  }
  return page;
}

/**
 * Opens a URL in the persistent browser session.
 * Creates the browser if it doesn't exist.
 * If an aggregator site, uses authenticated context with saved cookies.
 */
export async function openPage(url: string): Promise<{ page: Page; resolvedUrl: string }> {
  // If browser exists but is disconnected, clean up
  if (activeBrowser && !activeBrowser.isConnected()) {
    await closeBrowserSession();
  }

  if (!activeBrowser) {
    activeBrowser = await launchBrowser();
  }

  // Close existing context if navigating to a different domain type
  if (activeContext) {
    await activeContext.close().catch(() => {});
    activeContext = null;
    activePage = null;
  }

  const aggregator = detectAggregator(url);
  activeContext =
    aggregator !== "none"
      ? await createAuthenticatedContext(activeBrowser, aggregator)
      : await activeBrowser.newContext();

  activePage = await activeContext.newPage();
  await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Wait for DOM to settle
  await activePage
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});

  return { page: activePage, resolvedUrl: activePage.url() };
}

/**
 * Closes the browser session and resets all state.
 */
export async function closeBrowserSession(): Promise<void> {
  try {
    if (activeContext) await activeContext.close().catch(() => {});
    if (activeBrowser) await activeBrowser.close().catch(() => {});
  } finally {
    activeBrowser = null;
    activeContext = null;
    activePage = null;
  }
}

/**
 * Checks if an error indicates the browser was closed externally.
 */
export function isBrowserDead(err: unknown): boolean {
  return isBrowserClosedError(err);
}

// Cleanup on process exit to prevent orphaned Chrome processes
function cleanup() {
  if (activeBrowser) {
    activeBrowser.close().catch(() => {});
    activeBrowser = null;
    activeContext = null;
    activePage = null;
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/auto-apply/browser-session.test.ts
```
Expected: PASS

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/auto-apply/browser-session.ts tests/auto-apply/browser-session.test.ts
git commit -m "feat: add browser session manager for auto-apply"
```

---

## Task 4: Plugin — DOM Extractor

**Files:**
- Create: `src/auto-apply/dom-extractor.ts`
- Create: `tests/auto-apply/dom-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/auto-apply/dom-extractor.test.ts`:

See `tests/auto-apply/dom-extractor.test.ts` below.

This test file uses `@vitest-environment jsdom` and tests the extractor via a `runExtractorInDom()` function (a direct-callable version of the extraction logic, alongside the string version for `page.evaluate`).

Tests to include:
1. `buildExtractorScript` returns a non-empty string
2. `runExtractorInDom()` extracts fields from a form with labeled inputs and selects — verifies label, type, required, and options
3. `runExtractorInDom()` skips `type=hidden` inputs
4. `runExtractorInDom()` extracts `fieldGroup` from `<fieldset><legend>` containers

Add `jsdom` as a dev dependency: `npm install -D jsdom`

Note: The implementation should export both `buildExtractorScript()` (string for page.evaluate) and `runExtractorInDom()` (direct function for testing). The extraction logic should be defined once and shared between both.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/auto-apply/dom-extractor.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement dom-extractor.ts**

Create `src/auto-apply/dom-extractor.ts`. This module contains:

1. **`ExtractedField` interface** — the per-field shape returned to Claude
2. **`PageContext` interface** — page-level context (title, step indicator, errors)
3. **`ExtractionResult` interface** — combines fields + context
4. **`extractFormFields(page: Page)`** — main function that:
   - Waits for DOM stability (short settle)
   - Runs `page.evaluate()` with a script that:
     - Queries all visible `input`, `textarea`, `select` elements
     - For each: resolves label (via `for`, parent label, `aria-label`, `aria-labelledby`, nearby text), reads placeholder, required, current value, options (for select/radio)
     - Generates a unique selector (`#id` > `[name=...]` > nth-child path)
     - Groups by nearest `<fieldset>` legend or section heading, `null` if none
     - Extracts page title, step indicators, visible error messages
   - Discovers iframes and recurses into them via `page.frames()`
   - Returns `ExtractionResult`

```typescript
import { type Page, type Frame } from "playwright";

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

/**
 * Returns the JavaScript source that runs inside page.evaluate().
 * Exported separately so it can be unit-tested without a browser.
 */
export function buildExtractorScript(): string {
  return `(() => {
    const fields = [];
    const seen = new Set();

    function getUniqueSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      if (el.name) {
        const byName = document.querySelectorAll('[name="' + CSS.escape(el.name) + '"]');
        if (byName.length === 1) return '[name="' + CSS.escape(el.name) + '"]';
      }
      // Fallback: nth-child path
      const parts = [];
      let current = el;
      while (current && current !== document.body) {
        const parent = current.parentElement;
        if (!parent) break;
        const children = Array.from(parent.children);
        const index = children.indexOf(current) + 1;
        const tag = current.tagName.toLowerCase();
        parts.unshift(tag + ':nth-child(' + index + ')');
        current = parent;
      }
      return 'body > ' + parts.join(' > ');
    }

    function getLabelText(el) {
      // 1. label[for=id]
      if (el.id) {
        const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label) return label.textContent.trim();
      }
      // 2. Parent <label>
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll('input,select,textarea').forEach(c => c.remove());
        const text = clone.textContent.trim();
        if (text) return text;
      }
      // 3. aria-label
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      // 4. aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const refEl = document.getElementById(labelledBy);
        if (refEl) return refEl.textContent.trim();
      }
      // 5. Nearby text (previous sibling, parent's direct text)
      const prev = el.previousElementSibling;
      if (prev && ['LABEL', 'SPAN', 'P', 'DIV'].includes(prev.tagName)) {
        return prev.textContent.trim().substring(0, 100);
      }
      return '';
    }

    function getFieldGroup(el) {
      // Walk up to nearest fieldset legend or section heading
      let current = el.parentElement;
      while (current && current !== document.body) {
        if (current.tagName === 'FIELDSET') {
          const legend = current.querySelector('legend');
          if (legend) return legend.textContent.trim();
        }
        const headings = ['H1','H2','H3','H4'];
        if (headings.includes(current.tagName)) {
          return current.textContent.trim();
        }
        // Check if current has a heading child before this element
        for (const tag of headings) {
          const h = current.querySelector(tag);
          if (h) return h.textContent.trim();
        }
        current = current.parentElement;
      }
      return null;
    }

    function isVisible(el) {
      if (!el.offsetParent && el.style.position !== 'fixed') return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function isHoneypot(el) {
      const style = window.getComputedStyle(el);
      if (parseInt(style.left) < -1000 || parseInt(style.top) < -1000) return true;
      if (style.position === 'absolute' && (style.left === '-9999px' || style.top === '-9999px')) return true;
      if (el.tabIndex === -1 && el.getAttribute('aria-hidden') === 'true') return true;
      return false;
    }

    const selector = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select';
    const elements = document.querySelectorAll(selector);

    for (const el of elements) {
      if (!isVisible(el) || isHoneypot(el)) continue;

      const uniqueSelector = getUniqueSelector(el);
      if (seen.has(uniqueSelector)) continue;
      seen.add(uniqueSelector);

      const inputType = el.tagName === 'SELECT' ? 'select'
        : el.tagName === 'TEXTAREA' ? 'textarea'
        : (el.getAttribute('type') || 'text').toLowerCase();

      // Skip types we don't handle
      if (['password', 'search'].includes(inputType)) continue;

      let options = [];
      if (el.tagName === 'SELECT') {
        options = Array.from(el.options)
          .filter(o => o.value && !o.disabled)
          .map(o => o.text.trim());
      }

      // For radio buttons, group by name
      if (inputType === 'radio') {
        const name = el.getAttribute('name');
        if (name && seen.has('radio:' + name)) continue;
        if (name) seen.add('radio:' + name);
        const radios = document.querySelectorAll('input[type=radio][name="' + CSS.escape(name) + '"]');
        options = Array.from(radios).map(r => {
          const lbl = document.querySelector('label[for="' + CSS.escape(r.id) + '"]');
          return lbl ? lbl.textContent.trim() : r.value;
        });
      }

      fields.push({
        selector: uniqueSelector,
        type: inputType === 'file' ? 'file' : inputType,
        label: getLabelText(el),
        placeholder: el.getAttribute('placeholder') || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
        currentValue: inputType === 'checkbox' ? String(el.checked)
          : inputType === 'radio' ? (el.checked ? el.value : '')
          : (el.value || ''),
        options,
        fieldGroup: getFieldGroup(el),
      });
    }

    // Page context
    const pageTitle = document.title || '';

    // Step indicator (look for common patterns)
    let stepIndicator = null;
    const stepPatterns = document.querySelectorAll('[class*=step], [class*=progress], [aria-label*=step], [role=progressbar]');
    for (const el of stepPatterns) {
      if (isVisible(el)) {
        const text = el.textContent.trim();
        if (text && text.length < 100) {
          stepIndicator = text;
          break;
        }
      }
    }

    // Error messages
    const errorMessages = [];
    const errorEls = document.querySelectorAll('[class*=error], [role=alert], .invalid-feedback, .field-error');
    for (const el of errorEls) {
      if (isVisible(el)) {
        const text = el.textContent.trim();
        if (text && text.length < 200) errorMessages.push(text);
      }
    }

    return { fields, context: { pageTitle, stepIndicator, errorMessages } };
  })()`;
}

/**
 * Extract all visible form fields from the current page, including iframes.
 */
export async function extractFormFields(page: Page): Promise<ExtractionResult> {
  // Wait for DOM to settle
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});

  const script = buildExtractorScript();

  // Extract from main frame
  const mainResult = (await page.evaluate(script)) as ExtractionResult;

  // Extract from iframes
  const frames = page.frames();
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      const frameResult = (await frame.evaluate(script)) as ExtractionResult;
      if (frameResult.fields.length > 0) {
        // Prefix selectors with frame identifier
        const frameUrl = frame.url();
        const frameName = frame.name() || frameUrl;
        for (const field of frameResult.fields) {
          field.selector = `frame[${frameName}] >> ${field.selector}`;
          field.fieldGroup = field.fieldGroup
            ? `[iframe] ${field.fieldGroup}`
            : "[iframe]";
        }
        mainResult.fields.push(...frameResult.fields);
      }
    } catch {
      // Frame may be cross-origin or detached — skip
    }
  }

  return mainResult;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/auto-apply/dom-extractor.test.ts
```
Expected: PASS

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/auto-apply/dom-extractor.ts tests/auto-apply/dom-extractor.test.ts
git commit -m "feat: add DOM extractor for form field analysis"
```

---

## Task 5: Plugin — Update Profile Loader

**Files:**
- Modify: `src/auto-apply/profile-loader.ts`

- [ ] **Step 1: Add `workAuthorization` to both interfaces**

In `profile-loader.ts`, add to `UserProfile`:
```typescript
workAuthorization?: string;
```

Add to `ApiProfileResponse`:
```typescript
workAuthorization?: string;
```

Add to `mapApiProfileToUserProfile` return object:
```typescript
workAuthorization: raw.workAuthorization,
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/auto-apply/profile-loader.ts
git commit -m "feat: add workAuthorization to profile loader"
```

---

## Task 6: Plugin — Auto-Apply MCP Tools

**Files:**
- Create: `src/auto-apply/tools.ts`
- Create: `tests/auto-apply/tools.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/auto-apply/tools.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { registerAutoApplyTools } from "../../src/auto-apply/tools.js";

describe("registerAutoApplyTools", () => {
  it("is a function", () => {
    expect(typeof registerAutoApplyTools).toBe("function");
  });

  it("registers all 9 auto-apply tools", () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };

    registerAutoApplyTools(server as any);

    expect(tools.has("open_application_page")).toBe(true);
    expect(tools.has("extract_form_fields")).toBe(true);
    expect(tools.has("fill_form_field")).toBe(true);
    expect(tools.has("select_form_option")).toBe(true);
    expect(tools.has("upload_resume")).toBe(true);
    expect(tools.has("click_element")).toBe(true);
    expect(tools.has("set_default_cv")).toBe(true);
    expect(tools.has("take_page_screenshot")).toBe(true);
    expect(tools.has("close_browser")).toBe(true);
    expect(tools.size).toBe(9);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/auto-apply/tools.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement tools.ts**

Create `src/auto-apply/tools.ts`. Register all tools with FastMCP + Zod schemas:

```typescript
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { type SessionAuth } from "../types.js";
import { apiCall } from "../api.js";
import { openPage, requireActivePage, closeBrowserSession, isBrowserDead } from "./browser-session.js";
import { resolveApplyUrl } from "./resolve-apply-url.js";
import { extractFormFields } from "./dom-extractor.js";
import { loadUserProfile } from "./profile-loader.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function registerAutoApplyTools(server: FastMCP<SessionAuth>): void {

  // ── open_application_page ────────────────────────────────────
  server.addTool({
    name: "open_application_page",
    description:
      "Open a job application page in the browser. Detects aggregator sites (LinkedIn/Seek/Indeed) and resolves to the real application URL. Keeps the browser open for subsequent form-filling tool calls.",
    parameters: z.object({
      url: z.string().url().describe("The job listing or application URL"),
    }),
    execute: async (args) => {
      // For aggregator URLs (LinkedIn/Seek/Indeed), resolve to the real ATS URL first
      const { page: browserPage, resolvedUrl: initialUrl } = await openPage(args.url);
      let resolvedUrl = initialUrl;

      const { detectAggregator } = await import("./resolve-apply-url.js");
      if (detectAggregator(args.url) !== "none") {
        try {
          const { resolveApplyUrl } = await import("./resolve-apply-url.js");
          const { getActiveBrowser } = await import("./browser-session.js");
          const browser = getActiveBrowser();
          if (browser) {
            const atsUrl = await resolveApplyUrl(args.url, browser);
            if (atsUrl !== args.url) {
              // Navigate to the resolved ATS URL
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
      return JSON.stringify({ resolvedUrl, pageTitle });
    },
  });

  // ── extract_form_fields ──────────────────────────────────────
  server.addTool({
    name: "extract_form_fields",
    description:
      "Extract all visible form fields from the current page. Returns structured data for each field including label, type, options, and a CSS selector for filling. Call open_application_page first.",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();
      const result = await extractFormFields(page);
      return JSON.stringify(result, null, 2);
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
        // Try by label first, then by value
        const selected = await el
          .selectOption({ label: args.value }, { timeout: 5_000 })
          .catch(async () => {
            return el.selectOption({ value: args.value }, { timeout: 5_000 });
          });
        return JSON.stringify({ success: true, selectedOption: args.value });
      }

      // Radio: find the radio input with matching label and click it
      const inputType = await el.getAttribute("type").catch(() => "");
      if (inputType === "radio" || inputType === "checkbox") {
        await el.check({ timeout: 5_000 });
        return JSON.stringify({ success: true, selectedOption: args.value });
      }

      // Try clicking as generic interactive element
      await el.click({ timeout: 5_000 });
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

      // Get document info
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
        // Find primary CV
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

      // Download to temp file
      const ext = fileName.includes(".") ? fileName.split(".").pop() : "docx";
      const tempPath = join(tmpdir(), `jj-resume-${Date.now()}.${ext}`);

      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to download CV: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(tempPath, buffer);

        // Upload via Playwright
        await page.locator(args.selector).first().setInputFiles(tempPath, { timeout: 10_000 });

        return JSON.stringify({ success: true, fileName });
      } finally {
        // Always clean up temp file
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

      // Wait for potential navigation or DOM change
      await page
        .waitForLoadState("domcontentloaded", { timeout: 5_000 })
        .catch(() => {});
      // Extra settle for SPA
      await page.waitForTimeout(1_000);

      const newUrl = page.url();
      const fieldCountAfter = await page
        .locator("input:visible, textarea:visible, select:visible")
        .count()
        .catch(() => 0);

      const pageChanged = newUrl !== urlBefore || fieldCountAfter !== fieldCountBefore;

      return JSON.stringify({ success: true, newUrl, pageChanged });
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
      "Take a screenshot of the current page for visual inspection. Useful for verifying form state, handling CAPTCHAs, or debugging unusual layouts.",
    parameters: z.object({}),
    execute: async () => {
      const page = requireActivePage();
      const buffer = await page.screenshot({ fullPage: false });
      // Return as base64 data URI for the agent to view
      const base64 = buffer.toString("base64");
      return `data:image/png;base64,${base64}`;
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/auto-apply/tools.test.ts
```
Expected: PASS

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/auto-apply/tools.ts tests/auto-apply/tools.test.ts
git commit -m "feat: add auto-apply MCP tools (9 tools for AI-driven form filling)"
```

---

## Task 7: Plugin — Register Tools & Update Documents

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/documents.ts`

- [ ] **Step 1: Update `src/tools/documents.ts` to show `isPrimary` and `fileUrl`**

In the `get_documents` tool's execute function, update the CV formatting to include `isPrimary` and `fileUrl`:

```typescript
// In the CV listing loop, change:
cvs.forEach((cv, i) => {
  const primary = cv.isPrimary ? " [PRIMARY]" : "";
  results.push(
    `  ${i + 1}. ${cv.name}${primary} (${new Date(cv.createdOnUtc).toLocaleDateString()})\n     ID: ${cv.id}\n     File: ${cv.fileUrl ?? "n/a"}`
  );
});
```

Update the type cast for `cvData` to include `isPrimary` and `fileUrl`:
```typescript
const cvData = (await apiCall("/api/document/cvs", {}, apiKey)) as {
  items?: Array<{ id: string; name: string; createdOnUtc: string; isPrimary?: boolean; fileUrl?: string }>;
};
```

- [ ] **Step 2: Register auto-apply tools in `src/index.ts`**

Add import and registration:

```typescript
import { registerAutoApplyTools } from "./auto-apply/tools.js";
```

Add after `registerLocalScrapingTools(server);`:
```typescript
registerAutoApplyTools(server);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/tools/documents.ts
git commit -m "feat: register auto-apply tools and show isPrimary in document listing"
```

---

## Task 8: Plugin — Remove Old Pipeline & Deprecate SignalR Handler

**Files:**
- Delete: `src/auto-apply/form-filler.ts`
- Delete: `src/auto-apply/pipeline.ts`
- Modify: `src/agent/signalr-client.ts`

- [ ] **Step 1: Delete old files**

```bash
git rm src/auto-apply/form-filler.ts src/auto-apply/pipeline.ts
```

- [ ] **Step 2: Update SignalR client**

In `src/agent/signalr-client.ts`:

Remove the import:
```typescript
import { runAutoApplyPipeline } from "../auto-apply/pipeline.js";
```

Replace the `TriggerAutoApply` handler with a deprecation warning:

```typescript
connection.on(
  "TriggerAutoApply",
  async (request: { requestId: string; jobUrl: string }) => {
    console.warn(
      "[agent] TriggerAutoApply is deprecated — use MCP auto-apply tools instead.",
      request.requestId,
    );
    try {
      await connection.invoke("AutoApplyComplete", request.requestId, {
        success: false,
        error: "TriggerAutoApply is deprecated. Use the MCP auto-apply tools via the AI agent instead.",
      });
    } catch {
      // ignore
    }
  },
);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: remove hardcoded form filler, deprecate TriggerAutoApply SignalR handler"
```

---

## Task 9: Integration Verification

- [ ] **Step 1: Build the plugin**

```bash
npm run build
```
Expected: Clean build, no errors

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```
Expected: All pass

- [ ] **Step 3: Verify tool registration**

The tool registration test in `tests/auto-apply/tools.test.ts` already verifies all 9 tools are registered. Confirm it passes:
```bash
npx vitest run tests/auto-apply/tools.test.ts
```
Expected: PASS, all 9 tools registered.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: integration verification fixes"
```
