import cron from "node-cron";
import { openDatabase } from "../storage/sqlite/db.js";
import { SchedulesRepo } from "../storage/sqlite/schedules-repo.js";
import { runDiscovery } from "../discovery/core/run-discovery.js";
import { DiscoveryJobsRepo } from "../discovery/storage/discovery-jobs-repo.js";
import { ScrapeRunsRepo } from "../storage/sqlite/scrape-runs-repo.js";

interface AgentSchedulerDeps {
  runDiscovery?: typeof runDiscovery;
}

interface ScheduledTask {
  scheduleId: number;
  task: cron.ScheduledTask;
}

export class AgentScheduler {
  private tasks: Map<number, ScheduledTask> = new Map();
  private dbPath?: string;
  private readonly runDiscoveryImpl: typeof runDiscovery;

  constructor(dbPath?: string, deps: AgentSchedulerDeps = {}) {
    this.dbPath = dbPath;
    this.runDiscoveryImpl = deps.runDiscovery ?? runDiscovery;
  }

  private readonly discoveryLogger = (payload: Record<string, unknown>) => {
    console.log(`[agent:discover] ${JSON.stringify(payload)}`);
  };

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
            void this.runScheduledJob(s.id, s.keyword, s.location, s.source, s.run_mode, s.sources, s.pages);
          });
          this.tasks.set(s.id, { scheduleId: s.id, task });
        }
      }
    } finally {
      db.close();
    }
  }

  private async runScheduledJob(
    id: number,
    keyword: string,
    location: string,
    source: string,
    _runMode: string,
    sources: string | null,
    pages?: number | null,
  ): Promise<void> {
    const db = openDatabase(this.dbPath);
    const runsRepo = new ScrapeRunsRepo(db);
    const selectedSources = sources
      ? sources.split(",").map((v) => v.trim()).filter(Boolean)
      : [source];
    const run = runsRepo.createRun({
      scheduleId: id,
      keyword,
      location,
      source: "discover",
      runMode: "discover",
      sources: selectedSources.join(","),
    });

    try {
      const result = await this.runDiscoveryImpl({
        keyword,
        location,
        sources: selectedSources as any,
        pages: Math.min(pages ?? 30, 30),
        careerDiscovery: true,
      }, {
        logger: this.discoveryLogger,
      });
      new DiscoveryJobsRepo(db).upsertJobs(result.jobs, {
        keyword,
        location,
        runId: run.id,
      });
      runsRepo.finishRun(run.id, { status: "success", jobCount: result.jobs.length });
      new SchedulesRepo(db).updateLastRunAt(id);
    } catch (error) {
      runsRepo.finishRun(run.id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[agent] discovery failed for schedule ${id}:`, error);
    } finally {
      db.close();
    }
  }

  async runScheduledJobForTest(
    id: number,
    keyword: string,
    location: string,
    source: string,
    runMode: string,
    sources: string | null,
    pages?: number | null,
  ): Promise<void> {
    return this.runScheduledJob(id, keyword, location, source, runMode, sources, pages);
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
