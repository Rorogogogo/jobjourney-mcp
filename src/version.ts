import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const PLUGIN_NAME = "jobjourney-claude-plugin";

function loadVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Works from both src/ (dev) and dist/ (published)
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const PLUGIN_VERSION = "3.1.37";
