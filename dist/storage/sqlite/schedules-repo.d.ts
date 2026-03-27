import Database from "better-sqlite3";
export interface ScheduleInput {
    keyword: string;
    location: string;
    source: string;
    runMode?: "scrape" | "discover";
    sources?: string | null;
    pages?: number;
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
    pages: number | null;
    cron: string;
    created_at: string;
    updated_at: string | null;
    last_run_at: string | null;
    enabled: number;
}
export declare class SchedulesRepo {
    private readonly db;
    constructor(db: Database.Database);
    create(schedule: ScheduleInput): CreatedSchedule;
    list(enabledOnly?: boolean): ScheduleRow[];
    updateLastRunAt(id: number): void;
    toggle(id: number, enabled: boolean): boolean;
    delete(id: number): boolean;
    deleteAll(): number;
}
