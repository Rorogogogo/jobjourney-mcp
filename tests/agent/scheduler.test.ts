import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { AgentScheduler } from "../../src/agent/scheduler.js";
import { openDatabase } from "../../src/storage/sqlite/db.js";
import { SchedulesRepo } from "../../src/storage/sqlite/schedules-repo.js";
import { createTmpHome } from "../helpers/tmp-home.js";
import path from "node:path";

describe("AgentScheduler", () => {
  let dbPath: string;

  beforeEach(() => {
    const home = createTmpHome();
    dbPath = path.join(home, ".jobjourney", "jobs.db");
  });

  it("registers cron tasks from schedules", () => {
    const db = openDatabase(dbPath);
    const repo = new SchedulesRepo(db);
    repo.create({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
      cron: "0 9 * * *",
    });
    db.close();

    const scheduler = new AgentScheduler(dbPath);
    scheduler.reconcile();

    expect(scheduler.activeCount).toBe(1);
    scheduler.stop();
  });

  it("does not duplicate tasks on multiple reconcile calls", () => {
    const db = openDatabase(dbPath);
    const repo = new SchedulesRepo(db);
    repo.create({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
      cron: "0 9 * * *",
    });
    db.close();

    const scheduler = new AgentScheduler(dbPath);
    scheduler.reconcile();
    scheduler.reconcile();
    scheduler.reconcile();

    expect(scheduler.activeCount).toBe(1);
    scheduler.stop();
  });

  it("removes tasks when schedules are deleted", () => {
    const db = openDatabase(dbPath);
    const repo = new SchedulesRepo(db);
    repo.create({
      keyword: "AI Engineer",
      location: "Sydney",
      source: "seek",
      cron: "0 9 * * *",
    });
    db.close();

    const scheduler = new AgentScheduler(dbPath);
    scheduler.reconcile();
    expect(scheduler.activeCount).toBe(1);

    const db2 = openDatabase(dbPath);
    db2.prepare("DELETE FROM schedules").run();
    db2.close();

    scheduler.reconcile();
    expect(scheduler.activeCount).toBe(0);
    scheduler.stop();
  });

  it("runs discovery schedules through the discovery pipeline", async () => {
    const db = openDatabase(dbPath);
    const repo = new SchedulesRepo(db);
    const schedule = repo.create({
      keyword: "full stack",
      location: "Sydney",
      source: "discover",
      sources: "linkedin,seek",
      runMode: "discover",
      cron: "0 9 * * *",
    });
    db.close();

    const runDiscovery = vi.fn(async () => ({
      jobs: [],
      sources: ["linkedin", "seek"],
      failedSources: [],
      expandedCompanies: [],
    }));
    const scheduler = new AgentScheduler(dbPath, {
      runScrape: vi.fn(async () => ({ jobs: [], markdown: "", runId: 1 })),
      runDiscovery,
    });

    await scheduler.runScheduledJobForTest(
      schedule.id,
      schedule.keyword,
      schedule.location,
      schedule.source,
      schedule.runMode,
      schedule.sources,
    );

    expect(runDiscovery).toHaveBeenCalledWith({
      keyword: "full stack",
      location: "Sydney",
      sources: ["linkedin", "seek"],
      pages: 30,
    }, {
      logger: expect.any(Function),
    });
    scheduler.stop();
  });
});
