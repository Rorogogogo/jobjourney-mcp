// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { buildExtractorScript, runExtractorInDom } from "../../src/auto-apply/dom-extractor.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("buildExtractorScript", () => {
  it("returns a non-empty string", () => {
    const script = buildExtractorScript();
    expect(typeof script).toBe("string");
    expect(script.length).toBeGreaterThan(0);
  });
});

describe("runExtractorInDom", () => {
  it("extracts labeled text input and select fields", () => {
    document.body.innerHTML = `
      <form>
        <label for="fname">First Name</label>
        <input id="fname" type="text" placeholder="Enter name" required />
        <label for="country">Country</label>
        <select id="country">
          <option value="">Select...</option>
          <option value="au">Australia</option>
          <option value="nz">New Zealand</option>
        </select>
      </form>
    `;

    const result = runExtractorInDom();

    expect(result.fields.length).toBe(2);

    const nameField = result.fields.find(f => f.label === "First Name");
    expect(nameField).toBeDefined();
    expect(nameField!.type).toBe("text");
    expect(nameField!.selector).toBe("#fname");
    expect(nameField!.placeholder).toBe("Enter name");
    expect(nameField!.required).toBe(true);

    const countryField = result.fields.find(f => f.label === "Country");
    expect(countryField).toBeDefined();
    expect(countryField!.type).toBe("select");
    expect(countryField!.options).toContain("Australia");
    expect(countryField!.options).toContain("New Zealand");
  });

  it("skips hidden inputs", () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="csrf" value="abc123" />
        <input id="email" type="email" />
      </form>
    `;

    const result = runExtractorInDom();
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].type).toBe("email");
  });

  it("extracts fieldGroup from fieldset legend", () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Personal Info</legend>
          <input id="phone" type="tel" />
        </fieldset>
      </form>
    `;

    const result = runExtractorInDom();
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].fieldGroup).toBe("Personal Info");
  });

  it("extracts page context", () => {
    document.title = "Apply for Software Engineer";
    document.body.innerHTML = `
      <form>
        <input id="name" type="text" />
      </form>
    `;

    const result = runExtractorInDom();
    expect(result.context.pageTitle).toBe("Apply for Software Engineer");
  });
});
