import Database from "better-sqlite3";

export interface ScheduleInput {
  keyword: string;
  location: string;
  source: string;
  runMode?: "scrape" | "discover";
  sources?: string | null;
  cron: string;
}

export interface CreatedSchedule extends ScheduleInput {
  id: number;
  createdAt: string;
}

export interface ScheduleRow {
  id: number;
  keyword: string;
  location: string;
  source: string;
  run_mode: string;
  sources: string | null;
  cron: string;
  created_at: string;
  updated_at: string | null;
  last_run_at: string | null;
  enabled: number;
}

interface ScheduleIdParam {
  id: number;
}

interface ScheduleCreatedAtRow {
  created_at: string;
}

export class SchedulesRepo {
  constructor(private readonly db: Database.Database) {}

  create(schedule: ScheduleInput): CreatedSchedule {
    const result = this.db
      .prepare<ScheduleInput>(`
        INSERT INTO schedules (keyword, location, source, run_mode, sources, cron, created_at, updated_at)
        VALUES (@keyword, @location, @source, @runMode, @sources, @cron, datetime('now'), datetime('now'))
      `)
        .run({
          ...schedule,
          runMode: schedule.runMode ?? "scrape",
          sources: schedule.sources ?? undefined,
        });

    const id = Number(result.lastInsertRowid);
    const row = this.db
      .prepare<ScheduleIdParam, ScheduleCreatedAtRow>(`
        SELECT created_at
        FROM schedules
        WHERE id = @id
      `)
      .get({ id });

    if (!row) {
      throw new Error(`Failed to load created schedule ${id}`);
    }

    return {
      id,
      ...schedule,
      runMode: schedule.runMode ?? "scrape",
      sources: schedule.sources ?? undefined,
      createdAt: row.created_at,
    };
  }

  list(enabledOnly = true): ScheduleRow[] {
    if (enabledOnly) {
      return this.db
        .prepare<unknown[], ScheduleRow>(`
          SELECT id, keyword, location, source, run_mode, sources, cron, created_at, updated_at, last_run_at, enabled
          FROM schedules
          WHERE enabled = 1
          ORDER BY created_at DESC
        `)
        .all();
    }

    return this.db
      .prepare<unknown[], ScheduleRow>(`
        SELECT id, keyword, location, source, run_mode, sources, cron, created_at, updated_at, last_run_at, enabled
        FROM schedules
        ORDER BY created_at DESC
      `)
      .all();
  }

  updateLastRunAt(id: number): void {
    this.db
      .prepare<ScheduleIdParam>(`
        UPDATE schedules
        SET last_run_at = datetime('now')
        WHERE id = @id
      `)
      .run({ id });
  }
}
