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
});
