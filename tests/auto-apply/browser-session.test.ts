import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset module between tests to avoid singleton state bleed
beforeEach(() => {
  vi.resetModules();
});

describe("BrowserSession", () => {
  it("getActivePage returns null when no session exists", async () => {
    const { getActivePage } = await import("../../src/auto-apply/browser-session.js");
    expect(getActivePage()).toBeNull();
  });

  it("closeBrowserSession is a no-op when no session exists", async () => {
    const { closeBrowserSession } = await import("../../src/auto-apply/browser-session.js");
    // Should not throw
    await closeBrowserSession();
  });

  it("requireActivePage throws when no session exists", async () => {
    const { requireActivePage } = await import("../../src/auto-apply/browser-session.js");
    expect(() => requireActivePage()).toThrow("No page open");
  });
});
