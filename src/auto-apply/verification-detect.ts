import { type Page } from "playwright";

export interface VerificationHint {
  detected: boolean;
  type?: "email_code" | "phone_code" | "captcha" | "email_link";
  message?: string;
  email?: string;
  selector?: string;
  instruction?: string;
  searchHints?: {
    siteName?: string;
    domain?: string;
    afterTimestamp: string;
    searchQuery: string;
  };
}

/**
 * Detect if the current page is asking for a verification code or similar challenge.
 * Returns structured hints so any agent can act on it using whatever email/SMS MCP it has.
 */
export async function detectVerification(page: Page): Promise<VerificationHint> {
  const timestamp = new Date().toISOString();
  const pageUrl = page.url();
  let domain = "";
  try { domain = new URL(pageUrl).hostname.replace("www.", ""); } catch { /* ignore */ }

  const raw = await page.evaluate(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const html = document.body.innerHTML.toLowerCase();

    // Common verification patterns
    const emailCodePatterns = [
      "verification code",
      "verify your email",
      "enter the code",
      "enter code",
      "confirmation code",
      "one-time code",
      "otp",
      "we sent a code",
      "we've sent a code",
      "check your email",
      "check your inbox",
      "code sent to",
      "enter the 6-digit",
      "enter the 4-digit",
      "verify email address",
    ];

    const phoneCodePatterns = [
      "verify your phone",
      "sms code",
      "text message code",
      "we sent a text",
      "verify phone number",
    ];

    const captchaPatterns = [
      "captcha",
      "i'm not a robot",
      "recaptcha",
      "hcaptcha",
      "verify you are human",
    ];

    const emailLinkPatterns = [
      "click the link in your email",
      "click the link we sent",
      "verify via the link",
      "confirmation link",
      "activate your account",
    ];

    // Find the code input field
    function findCodeInput(): string | undefined {
      const selectors = [
        'input[name*="code"]',
        'input[name*="otp"]',
        'input[name*="verification"]',
        'input[name*="token"]',
        'input[placeholder*="code"]',
        'input[placeholder*="verification"]',
        'input[aria-label*="code"]',
        'input[aria-label*="verification"]',
        'input[type="tel"][maxlength="6"]',
        'input[type="tel"][maxlength="4"]',
        'input[type="number"][maxlength="6"]',
        'input[inputmode="numeric"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el && el.offsetParent !== null) {
          if (el.id) return "#" + CSS.escape(el.id);
          const name = el.getAttribute("name");
          if (name) return `[name="${CSS.escape(name)}"]`;
          return sel;
        }
      }
      return undefined;
    }

    // Extract email address shown on page
    function findEmailOnPage(): string | undefined {
      const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/;
      const match = document.body.innerText.match(emailRegex);
      return match?.[0];
    }

    // Check patterns
    for (const pattern of emailCodePatterns) {
      if (bodyText.includes(pattern)) {
        return {
          detected: true,
          type: "email_code" as const,
          email: findEmailOnPage(),
          selector: findCodeInput(),
          siteName: document.title.split(/[|\-–—]/)[0]?.trim() || "",
        };
      }
    }

    for (const pattern of phoneCodePatterns) {
      if (bodyText.includes(pattern)) {
        return {
          detected: true,
          type: "phone_code" as const,
          selector: findCodeInput(),
          siteName: document.title.split(/[|\-–—]/)[0]?.trim() || "",
        };
      }
    }

    for (const pattern of captchaPatterns) {
      if (bodyText.includes(pattern) || html.includes("recaptcha") || html.includes("hcaptcha")) {
        return {
          detected: true,
          type: "captcha" as const,
          siteName: document.title.split(/[|\-–—]/)[0]?.trim() || "",
        };
      }
    }

    for (const pattern of emailLinkPatterns) {
      if (bodyText.includes(pattern)) {
        return {
          detected: true,
          type: "email_link" as const,
          email: findEmailOnPage(),
          siteName: document.title.split(/[|\-–—]/)[0]?.trim() || "",
        };
      }
    }

    return { detected: false as const };
  });

  if (!raw.detected) return { detected: false };

  // Enrich with site/time context for precise email search
  const siteName = raw.siteName || domain;

  const hint: VerificationHint = {
    detected: true,
    type: raw.type,
    email: raw.email,
    selector: raw.selector,
    searchHints: {
      siteName,
      domain,
      afterTimestamp: timestamp,
      searchQuery: `Find the most recent email from "${siteName}" (sender domain: ${domain}) received after ${timestamp}. Look for a verification code or confirmation link in the email body.`,
    },
    message: raw.type === "email_code"
      ? `${siteName} is requesting an email verification code`
      : raw.type === "phone_code"
        ? `${siteName} is requesting a phone/SMS verification code`
        : raw.type === "captcha"
          ? `CAPTCHA detected on ${siteName}`
          : `${siteName} sent a verification link by email`,
    instruction: raw.type === "email_code"
      ? `Search for a recent email from "${siteName}" (domain: ${domain}) received after ${timestamp}. Look for a numeric verification/confirmation code. Then use fill_form_field with selector "${raw.selector}" to enter it.`
      : raw.type === "email_link"
        ? `Search for a recent email from "${siteName}" (domain: ${domain}) received after ${timestamp}. Find the verification link and tell the user to click it.`
        : raw.type === "phone_code"
          ? `A phone verification code is needed from ${siteName}. This requires manual user input or SMS reading capability.`
          : `A CAPTCHA challenge is present on ${siteName}. This typically requires manual user intervention.`,
  };

  // Add setup nudge for email-dependent verification types
  if (raw.type === "email_code" || raw.type === "email_link") {
    hint.instruction += ` If you don't have an email MCP connected, ask the user to check their inbox manually. TIP: For fully autonomous auto-apply, set up an email MCP (Gmail, Outlook, etc.) so verification codes can be read automatically.`;
  }

  return hint;
}
