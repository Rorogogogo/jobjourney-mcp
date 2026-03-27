import cron from "node-cron";
import { openDatabase } from "../storage/sqlite/db.js";
import { SchedulesRepo } from "../storage/sqlite/schedules-repo.js";
import { runDiscovery } from "../discovery/core/run-discovery.js";
import { DiscoveryJobsRepo } from "../discovery/storage/discovery-jobs-repo.js";
import { ScrapeRunsRepo } from "../storage/sqlite/scrape-runs-repo.js";
import { onScrapeComplete } from "../tools/post-scrape.js";
export class AgentScheduler {
    tasks = new Map();
    dbPath;
    runDiscoveryImpl;
    constructor(dbPath, deps = {}) {
        this.dbPath = dbPath;
        this.runDiscoveryImpl = deps.runDiscovery ?? runDiscovery;
    }
    discoveryLogger = (payload) => {
        console.log(`[agent:discover] ${JSON.stringify(payload)}`);
    };
    reconcile() {
        const db = openDatabase(this.dbPath);
        try {
            const repo = new SchedulesRepo(db);
            const schedules = repo.list(true);
            // Remove tasks for schedules that no longer exist or are disabled
            const activeIds = new Set(schedules.map((s) => s.id));
            for (const [id, entry] of this.tasks) {
                if (!activeIds.has(id)) {
                    entry.task.stop();
                    this.tasks.delete(id);
                }
            }
            // Add new schedules
            for (const schedule of schedules) {
                const s = schedule;
                if (!this.tasks.has(s.id) && cron.validate(s.cron)) {
                    const task = cron.schedule(s.cron, () => {
                        void this.runScheduledJob(s.id, s.keyword, s.location, s.source, s.run_mode, s.sources, s.pages);
                    });
                    this.tasks.set(s.id, { scheduleId: s.id, task });
                }
            }
        }
        finally {
            db.close();
        }
    }
    async runScheduledJob(id, keyword, location, source, _runMode, sources, pages) {
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
                sources: selectedSources,
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
            // Post-scrape: notify backend + open browser
            void onScrapeComplete({
                runId: run.id,
                keyword,
                location,
                sources: selectedSources,
                totalJobs: result.jobs.length,
                jobs: result.jobs.map((j) => ({
                    title: j.title,
                    company: j.company,
                    location: j.location,
                })),
            });
        }
        catch (error) {
            runsRepo.finishRun(run.id, {
                status: "error",
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`[agent] discovery failed for schedule ${id}:`, error);
        }
        finally {
            db.close();
        }
    }
    async runScheduledJobForTest(id, keyword, location, source, runMode, sources, pages) {
        return this.runScheduledJob(id, keyword, location, source, runMode, sources, pages);
    }
    stop() {
        for (const [, entry] of this.tasks) {
            entry.task.stop();
        }
        this.tasks.clear();
    }
    get activeCount() {
        return this.tasks.size;
    }
}
