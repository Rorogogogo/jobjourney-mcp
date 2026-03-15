export class ScrapeRunsRepo {
    db;
    constructor(db) {
        this.db = db;
    }
    createRun(run) {
        const result = this.db
            .prepare(`
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
    finishRun(id, result) {
        this.db
            .prepare(`
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
