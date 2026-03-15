import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../../src/storage/sqlite/db.js";
import { createTmpHome } from "../../helpers/tmp-home.js";

describe("openDatabase", () => {
  let dbPath: string;

  beforeEach(() => {
    const home = createTmpHome();
    dbPath = path.join(home, ".jobjourney", "jobs.db");
  });

  it("creates jobs, schedules, and scrape_runs tables", () => {
    const db = openDatabase(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map((r) => r.name);

    expect(names).toContain("jobs");
    expect(names).toContain("schedules");
    expect(names).toContain("scrape_runs");

    db.close();
  });

  it("enforces unique url on jobs", () => {
    const db = openDatabase(dbPath);

    db.prepare(
      "INSERT INTO jobs (title, company, location, url, source, scraped_at) VALUES ('A', 'B', 'C', 'https://x.com/1', 'seek', '2026-01-01')",
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO jobs (title, company, location, url, source, scraped_at) VALUES ('A', 'B', 'C', 'https://x.com/1', 'seek', '2026-01-01')",
      ).run();
    }).toThrow();

    db.close();
  });
});
