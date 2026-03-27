import * as signalR from "@microsoft/signalr";
import { openDatabase } from "../storage/sqlite/db.js";
export async function createSignalRClient(options) {
    const baseUrl = options.apiUrl.endsWith("/api")
        ? options.apiUrl.slice(0, -4)
        : options.apiUrl;
    const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${baseUrl}/agenthub`, {
        headers: { "X-API-Key": options.apiKey },
    })
        .withAutomaticReconnect()
        .build();
    connection.on("FetchJobs", async (request) => {
        const db = openDatabase(options.dbPath);
        try {
            const jobs = db
                .prepare(`SELECT title, company, location, source,
                  COALESCE(job_url, url) AS jobUrl,
                  external_url AS externalUrl,
                  ats_type AS atsType,
                  COALESCE(posted_at, posted_date) AS postedAt,
                  salary, job_type AS jobType,
                  work_arrangement AS workArrangement,
                  company_logo_url AS companyLogoUrl,
                  required_skills AS requiredSkills,
                  description,
                  tech_stack AS techStack,
                  applicant_count AS applicantCount,
                  experience_level AS experienceLevel,
                  experience_years AS experienceYears,
                  salary_min AS salaryMin,
                  salary_max AS salaryMax,
                  salary_currency AS salaryCurrency,
                  salary_period AS salaryPeriod,
                  is_pr_required AS isPrRequired,
                  security_clearance AS securityClearance,
                  is_already_applied AS isAlreadyApplied,
                  applied_date_utc AS appliedDateUtc
           FROM jobs
           WHERE run_id = ?
           ORDER BY rowid ASC`)
                .all(request.runId);
            if (jobs.length === 0) {
                // Stay silent — another agent instance may have this runId
                return;
            }
            await connection.invoke("JobsResponse", request.requestId, jobs);
        }
        catch (error) {
            console.error("[agent] FetchJobs error:", error);
        }
        finally {
            db.close();
        }
    });
    connection.on("TriggerAutoApply", async (request) => {
        console.warn("[agent] TriggerAutoApply is deprecated — use MCP auto-apply tools instead.", request.requestId);
        try {
            await connection.invoke("AutoApplyComplete", request.requestId, {
                success: false,
                error: "TriggerAutoApply is deprecated. Use the MCP auto-apply tools via the AI agent instead.",
            });
        }
        catch {
            // ignore
        }
    });
    connection.onreconnected(() => {
        console.log("[agent] SignalR reconnected");
    });
    connection.onclose(() => {
        console.log("[agent] SignalR connection closed");
    });
    await connection.start();
    console.log("[agent] SignalR connected to", baseUrl);
    return connection;
}
