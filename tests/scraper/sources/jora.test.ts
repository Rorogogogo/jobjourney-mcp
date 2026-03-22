import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { dismissPopups } from "../../../src/scraper/sources/jora.js";

describe("JoraScraper popup handling", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page.close();
    await browser.close();
  });

  it("dismisses blocking dialogs and restores page scroll", async () => {
    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <main style="height: 2000px;">Jora results</main>
          <div
            id="popup"
            role="dialog"
            aria-modal="true"
            class="signup-popup"
            style="position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.45);"
          >
            <div style="margin: 80px auto; width: 320px; background: white; padding: 16px;">
              <button id="close-popup" aria-label="Close">Close</button>
            </div>
          </div>
        </body>
      </html>
    `);

    await page.evaluate(() => {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.getElementById("close-popup")?.addEventListener("click", () => {
        document.getElementById("popup")?.remove();
      });
    });

    await dismissPopups(page);

    const state = await page.evaluate(() => ({
      popupPresent: Boolean(document.getElementById("popup")),
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
    }));

    expect(state.popupPresent).toBe(false);
    expect(state.htmlOverflow).not.toBe("hidden");
    expect(state.bodyOverflow).not.toBe("hidden");
  });
});
