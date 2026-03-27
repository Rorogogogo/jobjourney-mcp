export class SchedulesRepo {
    db;
    constructor(db) {
        this.db = db;
    }
    create(schedule) {
        const result = this.db
            .prepare(`
        INSERT INTO schedules (keyword, location, source, run_mode, sources, pages, cron, created_at, updated_at)
        VALUES (@keyword, @location, @source, @runMode, @sources, @pages, @cron, datetime('now'), datetime('now'))
      `)
            .run({
            ...schedule,
            runMode: schedule.runMode ?? "scrape",
            sources: schedule.sources ?? undefined,
            pages: schedule.pages ?? 30,
        });
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
            runMode: schedule.runMode ?? "scrape",
            sources: schedule.sources ?? undefined,
            createdAt: row.created_at,
        };
    }
    list(enabledOnly = true) {
        if (enabledOnly) {
            return this.db
                .prepare(`
          SELECT id, keyword, location, source, run_mode, sources, pages, cron, created_at, updated_at, last_run_at, enabled
          FROM schedules
          WHERE enabled = 1
          ORDER BY created_at DESC
        `)
                .all();
        }
        return this.db
            .prepare(`
        SELECT id, keyword, location, source, run_mode, sources, pages, cron, created_at, updated_at, last_run_at, enabled
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
    toggle(id, enabled) {
        const result = this.db
            .prepare(`
        UPDATE schedules
        SET enabled = @enabled, updated_at = datetime('now')
        WHERE id = @id
      `)
            .run({ id, enabled: enabled ? 1 : 0 });
        return result.changes > 0;
    }
    delete(id) {
        const result = this.db
            .prepare(`
        DELETE FROM schedules
        WHERE id = @id
      `)
            .run({ id });
        return result.changes > 0;
    }
    deleteAll() {
        const result = this.db.prepare(`DELETE FROM schedules`).run();
        return result.changes;
    }
}
