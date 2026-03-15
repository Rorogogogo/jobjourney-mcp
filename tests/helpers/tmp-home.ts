import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function createTmpHome(): string {
  return mkdtempSync(path.join(tmpdir(), "jobjourney-test-"));
}
