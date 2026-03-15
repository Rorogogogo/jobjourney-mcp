import cron from "node-cron";
import { openDatabase } from "../storage/sqlite/db.js";
import { SchedulesRepo } from "../storage/sqlite/schedules-repo.js";
import { runScrape } from "../scraper/core/run-scrape.js";

interface ScheduledTask {
  scheduleId: number;
  task: cron.ScheduledTask;
}

export class AgentScheduler {
  private tasks: Map<number, ScheduledTask> = new Map();
  private dbPath?: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath;
  }

  reconcile(): void {
    const db = openDatabase(this.dbPath);
    try {
      const repo = new SchedulesRepo(db);
      const schedules = repo.list(true);

      // Remove tasks for schedules that no longer exist or are disabled
      const activeIds = new Set(schedules.map((s: any) => s.id));
      for (const [id, entry] of this.tasks) {
        if (!activeIds.has(id)) {
          entry.task.stop();
          this.tasks.delete(id);
        }
      }

      // Add new schedules
      for (const schedule of schedules) {
        const s = schedule as any;
        if (!this.tasks.has(s.id) && cron.validate(s.cron)) {
          const task = cron.schedule(s.cron, () => {
            this.runScheduledScrape(s.id, s.keyword, s.location, s.source);
          });
          this.tasks.set(s.id, { scheduleId: s.id, task });
        }
      }
    } finally {
      db.close();
    }
  }

  private async runScheduledScrape(
    id: number,
    keyword: string,
    location: string,
    source: string,
  ): Promise<void> {
    try {
      await runScrape({ keyword, location, source, dbPath: this.dbPath });
      const db = openDatabase(this.dbPath);
      try {
        new SchedulesRepo(db).updateLastRunAt(id);
      } finally {
        db.close();
      }
    } catch (error) {
      console.error(`[agent] scrape failed for schedule ${id}:`, error);
    }
  }

  stop(): void {
    for (const [, entry] of this.tasks) {
      entry.task.stop();
    }
    this.tasks.clear();
  }

  get activeCount(): number {
    return this.tasks.size;
  }
}
