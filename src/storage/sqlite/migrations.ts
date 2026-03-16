import Database from "better-sqlite3";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  job_url TEXT,
  external_url TEXT,
  source TEXT NOT NULL,
  ats_type TEXT,
  ats_identifier TEXT,
  description TEXT,
  salary TEXT,
  posted_date TEXT,
  posted_at TEXT,
  job_type TEXT,
  workplace_type TEXT,
  work_arrangement TEXT,
  company_logo_url TEXT,
  applicant_count TEXT,
  is_already_applied INTEGER DEFAULT 0,
  applied_date_utc TEXT,
  scraped_at TEXT NOT NULL,
  extracted_at TEXT,
  salary_raw TEXT,
  salary_min TEXT,
  salary_max TEXT,
  salary_currency TEXT,
  salary_period TEXT,
  required_skills TEXT,
  tech_stack TEXT,
  experience_level TEXT,
  experience_years INTEGER,
  is_pr_required INTEGER DEFAULT 0,
  security_clearance TEXT,
  pr_confidence TEXT,
  pr_reasoning TEXT,
  run_id INTEGER,
  keyword TEXT,
  search_location TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  source TEXT NOT NULL,
  run_mode TEXT NOT NULL DEFAULT 'scrape',
  sources TEXT,
  cron TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  source TEXT NOT NULL,
  run_mode TEXT NOT NULL DEFAULT 'scrape',
  sources TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  job_count INTEGER DEFAULT 0,
  error TEXT
);
`;

export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  ensureJobsColumns(db);
}

function ensureJobsColumns(db: Database.Database): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  const requiredColumns: Array<[string, string]> = [
    ["job_url", "TEXT"],
    ["external_url", "TEXT"],
    ["ats_type", "TEXT"],
    ["ats_identifier", "TEXT"],
    ["posted_at", "TEXT"],
    ["work_arrangement", "TEXT"],
    ["extracted_at", "TEXT"],
    ["salary_raw", "TEXT"],
    ["salary_min", "TEXT"],
    ["salary_max", "TEXT"],
    ["salary_currency", "TEXT"],
    ["salary_period", "TEXT"],
    ["required_skills", "TEXT"],
    ["tech_stack", "TEXT"],
    ["experience_level", "TEXT"],
    ["experience_years", "INTEGER"],
    ["is_pr_required", "INTEGER DEFAULT 0"],
    ["security_clearance", "TEXT"],
    ["pr_confidence", "TEXT"],
    ["pr_reasoning", "TEXT"],
  ];

  for (const [name, type] of requiredColumns) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
    }
  }

  ensureTableColumns(db, "schedules", [
    ["run_mode", "TEXT NOT NULL DEFAULT 'scrape'"],
    ["sources", "TEXT"],
  ]);
  ensureTableColumns(db, "scrape_runs", [
    ["run_mode", "TEXT NOT NULL DEFAULT 'scrape'"],
    ["sources", "TEXT"],
  ]);
}

function ensureTableColumns(
  db: Database.Database,
  tableName: string,
  requiredColumns: Array<[string, string]>,
): void {
  const existingColumns = new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  for (const [name, type] of requiredColumns) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`);
    }
  }
}
