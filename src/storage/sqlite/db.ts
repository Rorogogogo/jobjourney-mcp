import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getJobJourneyPaths } from "../../config/paths.js";

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      description TEXT,
      salary TEXT,
      posted_date TEXT,
      job_type TEXT,
      workplace_type TEXT,
      company_logo_url TEXT,
      applicant_count TEXT,
      is_already_applied INTEGER DEFAULT 0,
      applied_date_utc TEXT,
      scraped_at TEXT NOT NULL,
      run_id INTEGER,
      keyword TEXT,
      search_location TEXT
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      source TEXT NOT NULL,
      cron TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      last_run_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      job_count INTEGER,
      error TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
  `);
}

export function openDatabase(
  dbPath: string = getJobJourneyPaths().dbPath,
): Database.Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  ensureSchema(db);

  return db;
}
