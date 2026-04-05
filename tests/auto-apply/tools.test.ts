import { describe, it, expect } from "vitest";
import { registerAutoApplyTools } from "../../src/auto-apply/tools.js";

describe("registerAutoApplyTools", () => {
  it("is a function", () => {
    expect(typeof registerAutoApplyTools).toBe("function");
  });

  it("registers all 12 auto-apply tools", () => {
    const tools = new Map<string, any>();
    const server = {
      addTool(definition: any) {
        tools.set(definition.name, definition);
      },
    };

    registerAutoApplyTools(server as any);

    expect(tools.has("open_application_page")).toBe(true);
    expect(tools.has("extract_form_fields")).toBe(true);
    expect(tools.has("fill_form_field")).toBe(true);
    expect(tools.has("select_form_option")).toBe(true);
    expect(tools.has("upload_resume")).toBe(true);
    expect(tools.has("click_element")).toBe(true);
    expect(tools.has("set_default_cv")).toBe(true);
    expect(tools.has("take_page_screenshot")).toBe(true);
    expect(tools.has("close_browser")).toBe(true);
    expect(tools.has("auto_fill_application")).toBe(true);
    expect(tools.has("get_page_snapshot")).toBe(true);
    expect(tools.has("check_auto_apply_setup")).toBe(true);
    expect(tools.size).toBe(12);
  });
});
