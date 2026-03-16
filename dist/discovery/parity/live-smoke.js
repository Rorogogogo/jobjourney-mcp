import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { runDiscovery } from "../core/run-discovery.js";
import { DiscoveryJobsRepo } from "../storage/discovery-jobs-repo.js";
import { openDatabase } from "../../storage/sqlite/db.js";
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(MODULE_DIR, "../../..");
const DEFAULT_REFERENCE_ROOT = resolve(PLUGIN_ROOT, "../../scrpaing_testing");
export async function runLiveParitySmoke(options = {}) {
    const request = createLiveParityRequest(options);
    if (request.sources.length !== 1 || request.sources[0] !== "linkedin") {
        throw new Error("Live parity smoke currently supports linkedin-only runs.");
    }
    const generatedAt = options.generatedAt?.() ?? new Date().toISOString();
    const executeTsRun = options.executeTsRun ??
        (async (runOptions) => {
            const result = await runDiscovery(runOptions, {
                logger: (payload) => {
                    console.log(`[live-smoke] ${JSON.stringify(payload)}`);
                },
            });
            return result.jobs;
        });
    const executePythonRun = options.executePythonRun ?? ((liveRequest) => runPythonLiveSmoke(liveRequest));
    const tsJobs = await executeTsRun({
        keyword: request.keyword,
        location: request.location,
        pages: request.pages,
        minDelay: request.minDelay,
        maxDelay: request.maxDelay,
        sources: ["linkedin"],
        careerDiscovery: false,
    });
    if ((options.persistTsJobs ?? true) && tsJobs.length > 0) {
        await (options.storeTsJobs ?? persistTsJobsToDatabase)(tsJobs, request);
    }
    const tsSummary = summarizeDiscoveryJobs(tsJobs, "linkedin");
    const pythonSummary = await executePythonRun(request);
    const report = buildLiveParityReport({
        generatedAt,
        request,
        tsSummary,
        pythonSummary,
    });
    const reportPath = options.reportPath ??
        createDefaultLiveParityReportPath({
            generatedAt,
            keyword: request.keyword,
            location: request.location,
        });
    writeLiveParityReport(report, reportPath);
    return {
        report,
        reportPath,
    };
}
export async function persistTsJobsToDatabase(jobs, request) {
    const db = openDatabase();
    try {
        new DiscoveryJobsRepo(db).upsertJobs(jobs, {
            keyword: request.keyword,
            location: request.location,
        });
    }
    finally {
        db.close();
    }
}
export function buildLiveParityReport(options) {
    const differences = [];
    if (options.tsSummary.totalJobs !== options.pythonSummary.totalJobs) {
        differences.push("totalJobs");
    }
    if (options.tsSummary.postedAtCount !== options.pythonSummary.postedAtCount) {
        differences.push("postedAtCount");
    }
    if (options.tsSummary.externalUrlCount !== options.pythonSummary.externalUrlCount) {
        differences.push("externalUrlCount");
    }
    if (!areJsonEqual(options.tsSummary.atsBreakdown, options.pythonSummary.atsBreakdown)) {
        differences.push("atsBreakdown");
    }
    if (!areJsonEqual(options.tsSummary.externalJobs, options.pythonSummary.externalJobs)) {
        differences.push("externalJobs");
    }
    return {
        generatedAt: options.generatedAt,
        request: options.request,
        status: differences.length > 0 ? "diverged" : "matched",
        differences,
        ts: options.tsSummary,
        python: options.pythonSummary,
    };
}
export function writeLiveParityReport(report, reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
}
export function summarizeDiscoveryJobs(jobs, source) {
    const filteredJobs = jobs.filter((job) => job.source === source && isPrimaryPlatformJob(job, source));
    return {
        totalJobs: filteredJobs.length,
        postedAtCount: filteredJobs.filter((job) => !!job.postedAt).length,
        externalUrlCount: filteredJobs.filter((job) => !!job.externalUrl).length,
        atsBreakdown: filteredJobs.reduce((acc, job) => {
            acc[job.atsType] = (acc[job.atsType] ?? 0) + 1;
            return acc;
        }, {}),
        firstJobIds: filteredJobs.slice(0, 10).map((job) => job.id),
        externalJobs: filteredJobs
            .filter((job) => !!job.externalUrl)
            .slice(0, 5)
            .map((job) => ({
            jobId: job.id,
            title: job.title,
            company: job.company,
            externalUrl: job.externalUrl,
            atsType: job.atsType,
        })),
    };
}
function isPrimaryPlatformJob(job, source) {
    const url = job.jobUrl || "";
    if (!url) {
        return true;
    }
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (source === "linkedin") {
            return hostname.includes("linkedin.com");
        }
        if (source === "seek") {
            return hostname.includes("seek.");
        }
        if (source === "indeed") {
            return hostname.includes("indeed.");
        }
        if (source === "jora") {
            return hostname.includes("jora.");
        }
    }
    catch {
        return true;
    }
    return true;
}
async function runPythonLiveSmoke(request) {
    const referenceRoot = DEFAULT_REFERENCE_ROOT;
    const pythonExecutable = existsSync(resolve(referenceRoot, ".venv/bin/python"))
        ? resolve(referenceRoot, ".venv/bin/python")
        : "python3";
    const tempDir = mkdtempSync(join(tmpdir(), "jobjourney-python-live-parity-"));
    const dbPath = join(tempDir, "python-live-parity.db");
    const csvPath = join(tempDir, "python-live-parity.csv");
    await new Promise((resolveRun, reject) => {
        const child = spawn(pythonExecutable, [
            "main.py",
            "linkedin-search",
            request.keyword,
            request.location,
            "--pages",
            String(request.pages),
            "--min-delay",
            String(request.minDelay),
            "--max-delay",
            String(request.maxDelay),
            "--db",
            dbPath,
            "--csv",
            csvPath,
        ], {
            cwd: referenceRoot,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        let stdout = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            reject(error);
        });
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(normalizeProcessError(stderr || stdout || `python live smoke exited with code ${code ?? "unknown"}`)));
                return;
            }
            resolveRun();
        });
    });
    const db = new Database(dbPath, { readonly: true });
    try {
        const totals = db
            .prepare(`
          select
            count(*) as total_jobs,
            sum(case when posted_at is not null and posted_at != '' then 1 else 0 end) as posted_at_count,
            sum(case when apply_url != '' then 1 else 0 end) as external_url_count
          from jobs
          where source = 'linkedin'
        `)
            .get();
        const atsRows = db
            .prepare(`
          select ats_type, count(*) as job_count
          from jobs
          where source = 'linkedin'
          group by ats_type
          order by ats_type
        `)
            .all();
        const firstJobIds = db
            .prepare(`
          select job_id
          from jobs
          where source = 'linkedin'
          order by rowid
          limit 10
        `)
            .all();
        const externalJobs = db
            .prepare(`
          select job_id, title, company, apply_url, ats_type
          from jobs
          where source = 'linkedin' and apply_url != ''
          order by rowid
          limit 5
        `)
            .all();
        return {
            totalJobs: totals.total_jobs,
            postedAtCount: totals.posted_at_count ?? 0,
            externalUrlCount: totals.external_url_count ?? 0,
            atsBreakdown: Object.fromEntries(atsRows.map((row) => [row.ats_type, row.job_count])),
            firstJobIds: firstJobIds.map((row) => row.job_id),
            externalJobs: externalJobs.map((row) => ({
                jobId: row.job_id,
                title: row.title,
                company: row.company,
                externalUrl: row.apply_url,
                atsType: row.ats_type,
            })),
        };
    }
    finally {
        db.close();
    }
}
function createLiveParityRequest(options) {
    return {
        keyword: options.keyword ?? "full stack",
        location: options.location ?? "Sydney",
        pages: options.pages ?? 1,
        minDelay: options.minDelay ?? 1.2,
        maxDelay: options.maxDelay ?? 1.8,
        sources: options.sources ?? ["linkedin"],
    };
}
function createDefaultLiveParityReportPath(options) {
    const slug = `${options.keyword}-${options.location}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const date = options.generatedAt.slice(0, 10);
    return resolve(PLUGIN_ROOT, "docs/reports", `${date}-${slug}-live-parity-smoke.json`);
}
function areJsonEqual(left, right) {
    return JSON.stringify(sortJsonValue(left)) === JSON.stringify(sortJsonValue(right));
}
function sortJsonValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sortJsonValue(entry));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, sortJsonValue(entry)]));
    }
    return value;
}
function normalizeProcessError(value) {
    return value.trim().replace(/\s+/g, " ");
}
