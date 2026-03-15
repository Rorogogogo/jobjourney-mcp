import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { scrapeSeekPage } from "../../../src/scraper/sources/seek.js";
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
    if (selector === '[data-testid="job-card-title"], a[data-automation="jobTitle"]') {
      return new MockValueLocator(this.card.title, this.card.href);
    }

    if (selector === '[data-automation="jobCompany"], span[class*="companyName"]') {
      return new MockValueLocator(this.card.company);
    }

    if (selector === '[data-testid="jobCardLocation"], [data-automation="jobCardLocation"]') {
      return new MockValueLocator(this.card.location);
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
    if (selector === '[data-testid="job-card"], article[data-card-type="JobCard"]') {
      return new MockCardsLocator(this.cards);
    }

    return new MockCardsLocator([]);
  }
}

function parseFixtureCards(html: string): FixtureJobCard[] {
  const cardPattern = /<div data-testid="job-card">([\s\S]*?)<\/div>/g;
  const cards: FixtureJobCard[] = [];

  for (const match of html.matchAll(cardPattern)) {
    const cardHtml = match[1];
    const titleMatch = cardHtml.match(
      /<a[^>]*data-testid="job-card-title"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/,
    );
    const companyMatch = cardHtml.match(
      /<span[^>]*data-automation="jobCompany"[^>]*>([^<]+)<\/span>/,
    );
    const locationMatch = cardHtml.match(
      /<span[^>]*data-testid="jobCardLocation"[^>]*>([^<]+)<\/span>/,
    );

    if (!titleMatch || !companyMatch || !locationMatch) {
      continue;
    }

    cards.push({
      href: titleMatch[1],
      title: titleMatch[2],
      company: companyMatch[1],
      location: locationMatch[1],
    });
  }

  return cards;
}

describe("SeekScraper", () => {
  let page: Page;

  beforeAll(async () => {
    page = new MockPage() as unknown as Page;
  });

  afterAll(async () => {
    return;
  });

  it("extracts jobs from seek html using known selectors", async () => {
    const fixturePath = path.resolve(__dirname, "../../fixtures/seek-results.html");
    await page.goto(pathToFileURL(fixturePath).toString(), {
      waitUntil: "domcontentloaded",
    });

    const jobs = await scrapeSeekPage(page, { keyword: "AI Engineer", location: "Sydney" });

    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]).toMatchObject({
      title: expect.any(String),
      company: expect.any(String),
      location: expect.any(String),
      source: "seek",
    });
    expect(jobs[0].url).toContain("seek.com.au");
  });
});
