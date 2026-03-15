export class SchedulesRepo {
    db;
    constructor(db) {
        this.db = db;
    }
    create(schedule) {
        const result = this.db
            .prepare(`
        INSERT INTO schedules (keyword, location, source, cron, created_at)
        VALUES (@keyword, @location, @source, @cron, datetime('now'))
      `)
            .run(schedule);
        const id = Number(result.lastInsertRowid);
        const row = this.db
            .prepare(`
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
            createdAt: row.created_at,
        };
    }
    list(enabledOnly = true) {
        if (enabledOnly) {
            return this.db
                .prepare(`
          SELECT id, keyword, location, source, cron, created_at, updated_at, last_run_at, enabled
          FROM schedules
          WHERE enabled = 1
          ORDER BY created_at DESC
        `)
                .all();
        }
        return this.db
            .prepare(`
        SELECT id, keyword, location, source, cron, created_at, updated_at, last_run_at, enabled
        FROM schedules
        ORDER BY created_at DESC
      `)
            .all();
    }
    updateLastRunAt(id) {
        this.db
            .prepare(`
        UPDATE schedules
        SET last_run_at = datetime('now')
        WHERE id = @id
      `)
            .run({ id });
    }
}
