import { describe, expect, it } from "vitest";
import { detectPrRequirements } from "../../../src/discovery/analysis/pr-detection.js";

describe("detectPrRequirements", () => {
  it("detects PR or citizenship requirements with security clearance", () => {
    const result = detectPrRequirements(
      "Applicants must be Australian citizens and eligible for NV1 security clearance.",
    );

    expect(result.isPrRequired).toBe(true);
    expect(result.securityClearance).toBe("NV1");
    expect(result.confidence).toBe("high");
  });

  it("does not mark PR as required when sponsorship is available", () => {
    const result = detectPrRequirements(
      "Visa sponsorship available and international candidates welcome.",
    );

    expect(result.isPrRequired).toBe(false);
    expect(result.confidence).toBe("low");
  });

  it("detects australian permanent residency wording explicitly", () => {
    const result = detectPrRequirements(
      "Applicants must be Australian permanent residents or citizens to be considered.",
    );

    expect(result.isPrRequired).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("detects unrestricted work rights when sponsorship is unavailable", () => {
    const result = detectPrRequirements(
      "You must have full working rights in Australia and not require visa sponsorship.",
    );

    expect(result.isPrRequired).toBe(true);
    expect(result.confidence).not.toBe("low");
  });

  it("does not mark PR as required when sponsorship availability overrides generic work-rights language", () => {
    const result = detectPrRequirements(
      "Candidates must have work authorization in Australia. Visa sponsorship is available for exceptional applicants.",
    );

    expect(result.isPrRequired).toBe(false);
  });

  it("still marks PR as required when citizenship and sponsorship text both appear", () => {
    const result = detectPrRequirements(
      "Australian citizenship is required for this defence role. Visa sponsorship is not available.",
    );

    expect(result.isPrRequired).toBe(true);
    expect(result.securityClearance).toBeNull();
    expect(result.confidence).toBe("high");
  });
});
