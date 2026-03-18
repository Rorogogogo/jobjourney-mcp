import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { scrapeLinkedInPage } from "../../../src/scraper/sources/linkedin.js";
import { getAvailableSources } from "../../../src/scraper/core/run-scrape.js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type FixtureJobCard = {
  title: string;
  company: string;
  location: string;
  href: string;
};

class MockValueLocator {
  constructor(private readonly value: string, private readonly href?: string) {}

  first(): MockValueLocator {
    return this;
  }

  async textContent(): Promise<string> {
    return this.value;
  }

  async getAttribute(name: string): Promise<string | null> {
    if (name === "href" && this.href) {
      return this.href;
    }

    return null;
  }
}

class MockCardLocator {
  constructor(private readonly card: FixtureJobCard) {}

  locator(selector: string): MockValueLocator {
    if (
      selector ===
      ".artdeco-entity-lockup__title, a.base-card__full-link, .base-search-card__title"
    ) {
      return new MockValueLocator(this.card.title, this.card.href);
    }

    if (selector === ".artdeco-entity-lockup__subtitle, .base-search-card__subtitle") {
      return new MockValueLocator(this.card.company);
    }

    if (selector === 'span[class*="tvm__text"], .job-search-card__location') {
      return new MockValueLocator(this.card.location);
    }

    if (
      selector ===
      "a.job-card-list__title--link, a.base-card__full-link, .artdeco-entity-lockup__title a"
    ) {
      return new MockValueLocator(this.card.title, this.card.href);
    }

    return new MockValueLocator("");
  }
}

class MockCardsLocator {
  constructor(private readonly cards: FixtureJobCard[]) {}

  async all(): Promise<MockCardLocator[]> {
    return this.cards.map((card) => new MockCardLocator(card));
  }
}

class MockPage {
  private currentUrl = "about:blank";
  private cards: FixtureJobCard[] = [];

  async goto(url: string): Promise<void> {
    this.currentUrl = url;

    if (!url.startsWith("file://")) {
      return;
    }

    const html = await readFile(fileURLToPath(url), "utf8");
    this.cards = parseFixtureCards(html);
  }

  url(): string {
    return this.currentUrl;
  }

  async waitForSelector(): Promise<void> {
    return;
  }

  locator(selector: string): MockCardsLocator {
    if (
      selector ===
      'div.job-card-job-posting-card-wrapper, li[data-occludable-job-id], div.base-card'
    ) {
      return new MockCardsLocator(this.cards);
    }

    return new MockCardsLocator([]);
  }
}

function parseFixtureCards(html: string): FixtureJobCard[] {
  const cards: FixtureJobCard[] = [];

  const cardPattern =
    /<div class="base-card">\s*<a[^>]*class="base-card__full-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<div[^>]*class="base-search-card__subtitle"[^>]*>([^<]+)<\/div>\s*<span[^>]*class="job-search-card__location"[^>]*>([^<]+)<\/span>\s*<\/div>/g;

  for (const match of html.matchAll(cardPattern)) {
    cards.push({
      href: match[1],
      title: match[2],
      company: match[3],
      location: match[4],
    });
  }

  return cards;
}

describe("LinkedInScraper", () => {
  let page: Page;

  beforeAll(async () => {
    page = new MockPage() as unknown as Page;
  });

  afterAll(async () => {
    return;
  });

  it("extracts jobs from linkedin html using known selectors", async () => {
    const fixturePath = path.resolve(__dirname, "../../fixtures/linkedin-results.html");
    await page.goto(pathToFileURL(fixturePath).toString(), {
      waitUntil: "domcontentloaded",
    });

    const jobs = await scrapeLinkedInPage(page, { keyword: "AI Engineer", location: "Sydney" });

    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]).toMatchObject({
      title: expect.any(String),
      company: expect.any(String),
      source: "linkedin",
    });
    expect(jobs[0].url).toContain("linkedin.com");
  });

  it("linkedin is registered as available source", () => {
    expect(getAvailableSources()).toContain("linkedin");
  });
});
