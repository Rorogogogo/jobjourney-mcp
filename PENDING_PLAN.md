# Auto-Apply: Pending Plan

## What's done (merged to master)

### Phase 1 — SignalR trigger + URL resolution
- `src/agent/signalr-client.ts` — handles `TriggerAutoApply { requestId, jobUrl }`
  - streams `AutoApplyProgress { message }` throughout
  - fires `AutoApplyComplete { success, resolvedUrl, atsType, fieldsAttempted, fieldsFilled }`
- `src/auto-apply/resolve-apply-url.ts` — detects LinkedIn/Seek/Indeed aggregator pages,
  uses Playwright + saved cookies to click the Apply button and capture the real ATS URL

### Phase 2 — Profile loading + hardcoded form filling
- `src/auto-apply/profile-loader.ts` — fetches user profile from `GET /api/profile`
- `src/auto-apply/form-filler.ts` — fills forms using hardcoded selectors per ATS:
  - **Greenhouse**: `#first_name`, `#last_name`, `#email`, `#phone`, `.field` custom blocks
  - **Lever**: `input[name=name/email/phone/org/comments]`, `.application-question` cards
  - **Generic fallback**: keyword-matches inputs by label/placeholder/name/id
- `src/auto-apply/pipeline.ts` — orchestrates all steps end-to-end

---

## What's next — Phase 3: LLM-driven smart form filling

### Why
The current hardcoded selector approach breaks when:
- ATS sites update their UI
- Unknown ATS types (Workday, SmartRecruiters, Ashby, custom)
- Custom questions that need real answers (not just profile copy-paste)
- Multi-page forms

### What to build

Inspired by studying browser-use's actual source code, but built specifically
for job applications in TypeScript (no Python sidecar needed).

#### 3a. `src/auto-apply/dom-extractor.ts`
Use Playwright's built-in accessibility snapshot + input scanning to produce
a compact indexed field list:

```
[0] <input type="text"   label="First name"         required />
[1] <input type="text"   label="Last name"           required />
[2] <input type="email"  label="Email"               required />
[3] <input type="tel"    label="Phone number" />
[4] <select              label="Work authorisation"  options=["Citizen","PR","Visa"] />
[5] <textarea            label="Cover letter" />
[6] <input type="file"   label="Resume / CV" />
```

Key techniques borrowed from browser-use:
- Label resolution: `for=id` binding → aria-label → placeholder → nearest preceding text node
- Filter out hidden/disabled/file-upload fields from the LLM prompt
- Keep a `indexMap: Map<number, Locator>` so Playwright can act on LLM-returned indices

#### 3b. `src/auto-apply/fill-planner.ts`
One Claude API call with the field list + user profile → typed action plan:

```typescript
// Prompt includes:
// - indexed field list (compact, ~500 tokens)
// - user profile JSON
// - instruction to return JSON action array only

// Returns:
[
  { action: "fill",   index: 0, value: "Jane" },
  { action: "fill",   index: 1, value: "Smith" },
  { action: "fill",   index: 2, value: "jane@email.com" },
  { action: "select", index: 4, value: "Citizen" },
  { action: "fill",   index: 5, value: "I am excited about this role because..." },
  { action: "skip",   index: 6, reason: "resume upload — handled separately" }
]
```

#### 3c. Update `src/auto-apply/pipeline.ts`
Replace `fillApplicationForm()` call with:
1. `extractFormFields(page)` → indexed field list
2. `buildFillPlan(fields, profile)` → action plan (one LLM call)
3. `executePlan(page, indexMap, plan)` → Playwright executes actions
4. Detect page change (multi-page form) → loop back to step 1 for next page (max 5 pages)

#### 3d. Resume upload
- Fetch resume PDF URL from `GET /api/documents` (or profile)
- Download to a temp file
- Pass path to Playwright `setInputFiles()` on `input[type=file]`

### Token cost estimate
- System prompt: ~500 tokens (cached after first call)
- Field list: ~300–600 tokens per page
- Profile: ~400 tokens
- Response: ~200 tokens
- **Total per form: ~1,500 tokens ≈ $0.001 at Sonnet pricing**

### What stays the same
- `resolve-apply-url.ts` — no change needed, works well
- `profile-loader.ts` — no change needed
- SignalR contract — no change needed

---

## Known gaps (not in scope yet)

- Work authorisation / visa sponsorship selects — needs user preference stored in profile
- Salary expectation fields — needs user preference stored in profile  
- Multi-select checkboxes (skills, industries) — doable but needs extra handling
- CAPTCHA — not solvable programmatically, will need to surface to user
- LinkedIn Easy Apply (in-platform) — separate flow, not via external URL
