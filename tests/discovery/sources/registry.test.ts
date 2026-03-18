import { describe, expect, it } from "vitest";
import {
  DISCOVERY_SOURCE_NAMES,
  getDiscoverySourceDefinition,
} from "../../../src/discovery/sources/registry.js";

describe("discovery source registry", () => {
  it("lists all supported source names in stable order", () => {
    expect(DISCOVERY_SOURCE_NAMES).toEqual([
      "linkedin",
      "seek",
      "indeed",
      "jora",
    ]);
  });

  it("resolves transport mode and support status for built-in sources", () => {
    expect(getDiscoverySourceDefinition("linkedin")).toMatchObject({
      name: "linkedin",
      transport: "http",
      status: "active",
    });
    expect(getDiscoverySourceDefinition("seek")).toMatchObject({
      name: "seek",
      transport: "browser",
      status: "active",
    });
    expect(getDiscoverySourceDefinition("indeed")).toMatchObject({
      name: "indeed",
      transport: "browser",
      status: "planned",
    });
    expect(getDiscoverySourceDefinition("jora")).toMatchObject({
      name: "jora",
      transport: "browser",
      status: "planned",
    });
  });
});
