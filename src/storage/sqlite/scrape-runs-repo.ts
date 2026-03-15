import Database from "better-sqlite3";

export interface CreateRunInput {
  scheduleId?: number;
  keyword: string;
  location: string;
  source: string;
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
          status,
          started_at
        )
        VALUES (
          @scheduleId,
          @keyword,
          @location,
          @source,
          'running',
          datetime('now')
        )
      `)
      .run({
        scheduleId: run.scheduleId ?? null,
        keyword: run.keyword,
        location: run.location,
        source: run.source,
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
}
