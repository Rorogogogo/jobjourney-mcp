import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../../src/storage/sqlite/db.js";
import { SchedulesRepo } from "../../../src/storage/sqlite/schedules-repo.js";
import { createTmpHome } from "../../helpers/tmp-home.js";

describe("SchedulesRepo", () => {
  let repo: SchedulesRepo;

  beforeEach(() => {
    const home = createTmpHome();
    const db = openDatabase(path.join(home, ".jobjourney", "jobs.db"));
    repo = new SchedulesRepo(db);
  });

  it("creates a schedule and returns it with an id", () => {
    const schedule = repo.create({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
      cron: "0 9 * * *",
    });

    expect(schedule.id).toBeTruthy();
    expect(schedule.keyword).toBe("AI Engineer");
  });

  it("lists only enabled schedules by default", () => {
    repo.create({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
      cron: "0 9 * * *",
    });

    const list = repo.list();

    expect(list).toHaveLength(1);
  });

  it("stores discovery schedules with source lists and run mode", () => {
    const schedule = repo.create({
      keyword: "full stack",
      location: "Sydney",
      source: "discover",
      sources: "linkedin,seek",
      runMode: "discover",
      cron: "0 9 * * *",
    });

    const list = repo.list(false);

    expect(schedule.runMode).toBe("discover");
    expect(schedule.sources).toBe("linkedin,seek");
    expect(list[0]).toMatchObject({
      run_mode: "discover",
      sources: "linkedin,seek",
    });
  });
});
