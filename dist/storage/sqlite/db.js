import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getJobJourneyPaths } from "../../config/paths.js";
import { runMigrations } from "./migrations.js";
export function openDatabase(dbPath = getJobJourneyPaths().dbPath) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    runMigrations(db);
    return db;
}
