import { describe, expect, it } from "vitest";
import {
  ATS_PROVIDER_NAMES,
  getAtsProviderDefinition,
} from "../../../src/discovery/ats/registry.js";

describe("ATS provider registry", () => {
  it("lists supported ATS crawlers in stable order", () => {
    expect(ATS_PROVIDER_NAMES).toEqual(["greenhouse", "lever"]);
  });

  it("resolves active ATS providers", () => {
    expect(getAtsProviderDefinition("greenhouse")).toMatchObject({
      name: "greenhouse",
      status: "active",
    });
    expect(getAtsProviderDefinition("lever")).toMatchObject({
      name: "lever",
      status: "active",
    });
  });
});
