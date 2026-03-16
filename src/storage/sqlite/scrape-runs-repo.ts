import Database from "better-sqlite3";

export interface CreateRunInput {
  scheduleId?: number;
  keyword: string;
  location: string;
  source: string;
  runMode?: "scrape" | "discover";
  sources?: string | null;
}

export interface FinishRunInput {
  status: "success" | "error";
  jobCount?: number;
  error?: string;
}

interface CreateRunParams {
  scheduleId: number | null;
  keyword: string;
  location: string;
  source: string;
  runMode: "scrape" | "discover";
  sources: string | null;
}

interface FinishRunParams {
  id: number;
  status: "success" | "error";
  jobCount: number | null;
  error: string | null;
}

export class ScrapeRunsRepo {
  constructor(private readonly db: Database.Database) {}

  createRun(run: CreateRunInput): { id: number } {
    const result = this.db
      .prepare<CreateRunParams>(`
        INSERT INTO scrape_runs (
          schedule_id,
          keyword,
          location,
          source,
          run_mode,
          sources,
          status,
          started_at
        )
        VALUES (
          @scheduleId,
          @keyword,
          @location,
          @source,
          @runMode,
          @sources,
          'running',
          datetime('now')
        )
      `)
      .run({
        scheduleId: run.scheduleId ?? null,
        keyword: run.keyword,
        location: run.location,
        source: run.source,
        runMode: run.runMode ?? "scrape",
        sources: run.sources ?? null,
      });

    return { id: Number(result.lastInsertRowid) };
  }

  finishRun(id: number, result: FinishRunInput): void {
    this.db
      .prepare<FinishRunParams>(`
        UPDATE scrape_runs
        SET
          status = @status,
          finished_at = datetime('now'),
          job_count = @jobCount,
          error = @error
        WHERE id = @id
      `)
      .run({
        id,
        status: result.status,
        jobCount: result.jobCount ?? null,
        error: result.error ?? null,
      });
  }

  getLatestDiscoveryRun(): {
    id: number;
    keyword: string;
    location: string;
    source: string;
    run_mode: string;
    sources: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    job_count: number | null;
    error: string | null;
  } | null {
    return (
      this.db
        .prepare(
          `SELECT id, keyword, location, source, run_mode, sources, status, started_at, finished_at, job_count, error
           FROM scrape_runs
           WHERE run_mode = 'discover'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as
        | {
            id: number;
            keyword: string;
            location: string;
            source: string;
            run_mode: string;
            sources: string | null;
            status: string;
            started_at: string;
            finished_at: string | null;
            job_count: number | null;
            error: string | null;
          }
        | undefined
    ) ?? null;
  }
}
