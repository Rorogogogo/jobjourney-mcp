import { describe, expect, it } from "vitest";
import { analyzeJobDescription } from "../../../src/discovery/analysis/description-analysis.js";

describe("analyzeJobDescription", () => {
  it("analyzes work type, experience, tech stack, and PR requirements", () => {
    const description = `
      We are hiring a Senior Software Engineer for a full-time hybrid role in Sydney.
      You will need 5 years of experience building services with Python, React, AWS,
      PostgreSQL, and Docker.
      Applicants must be Australian citizens and eligible for NV1 security clearance.
    `;

    const result = analyzeJobDescription(description);

    expect(result.workArrangement.type).toBe("hybrid");
    expect(result.employmentType.type).toBe("full-time");
    expect(result.experienceLevel.level).toBe("senior");
    expect(result.experienceLevel.years).toBe(5);
    expect(result.techStack.technologies).toEqual([
      "AWS",
      "Docker",
      "PostgreSQL",
      "Python",
      "React",
    ]);
    expect(result.techStack.count).toBe(5);
    expect(result.prDetection.isPrRequired).toBe(true);
    expect(result.prDetection.securityClearance).toBe("NV1");
    expect(result.prDetection.confidence).toBe("high");
  });

  it("does not treat company history as experience years", () => {
    const description = `
      For over 30 years, ExampleCo has built enterprise platforms for customers worldwide.
      We are hiring a Senior Full Stack Engineer to join the team.
    `;

    const result = analyzeJobDescription(description);

    expect(result.experienceLevel.level).toBe("senior");
    expect(result.experienceLevel.years).toBeNull();
  });
});
