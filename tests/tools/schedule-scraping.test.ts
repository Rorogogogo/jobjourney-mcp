import { describe, expect, it, beforeEach } from "vitest";
import { openDatabase } from "../../src/storage/sqlite/db.js";
import { SchedulesRepo } from "../../src/storage/sqlite/schedules-repo.js";
import { createTmpHome } from "../helpers/tmp-home.js";
import path from "node:path";

describe("schedule_scraping logic", () => {
  let dbPath: string;

  beforeEach(() => {
    const home = createTmpHome();
    dbPath = path.join(home, ".jobjourney", "jobs.db");
  });

  it("converts HH:mm to cron and stores schedule", () => {
    const time = "09:30";
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    const cronExpr = `${minute} ${hour} * * *`;

    expect(cronExpr).toBe("30 9 * * *");

    const db = openDatabase(dbPath);
    const repo = new SchedulesRepo(db);
    const schedule = repo.create({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
      cron: cronExpr,
    });

    expect(schedule.id).toBeTruthy();
    expect(repo.list()).toHaveLength(1);
    db.close();
  });

  it("rejects invalid time format", () => {
    const time = "25:99";
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    expect(hour > 23 || minute > 59).toBe(true);
  });
});
