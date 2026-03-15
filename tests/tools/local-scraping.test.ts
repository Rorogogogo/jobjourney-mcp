import { describe, expect, it } from "vitest";
import { registerLocalScrapingTools } from "../../src/tools/local-scraping.js";

describe("registerLocalScrapingTools", () => {
  it("is a function that accepts a server", () => {
    expect(typeof registerLocalScrapingTools).toBe("function");
  });
});
