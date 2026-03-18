import { describe, expect, it } from "vitest";
import { createTmpHome } from "./tmp-home.js";

describe("tmp home helper", () => {
  it("provides an isolated temp directory", () => {
    const home = createTmpHome();
    expect(home).toBeTruthy();
    expect(home).toContain("jobjourney-test-");
  });
});
