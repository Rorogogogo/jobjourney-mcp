import * as signalR from "@microsoft/signalr";
import { openDatabase } from "../storage/sqlite/db.js";

export interface SignalRClientOptions {
  apiUrl: string;
  apiKey: string;
  dbPath?: string;
}

export async function createSignalRClient(options: SignalRClientOptions): Promise<signalR.HubConnection> {
  const baseUrl = options.apiUrl.endsWith("/api")
    ? options.apiUrl.slice(0, -4)
    : options.apiUrl;

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${baseUrl}/agenthub`, {
      headers: { "X-API-Key": options.apiKey },
    })
    .withAutomaticReconnect()
    .build();

  connection.on("FetchJobs", async (request: { requestId: string; runId: string }) => {
    const db = openDatabase(options.dbPath);
    try {
      const jobs = db
        .prepare(
          `SELECT title, company, location, source,
                  COALESCE(job_url, url) AS jobUrl,
                  external_url AS externalUrl,
                  ats_type AS atsType,
                  COALESCE(posted_at, posted_date) AS postedAt,
                  salary, job_type AS jobType,
                  work_arrangement AS workArrangement,
                  company_logo_url AS companyLogoUrl,
                  required_skills AS requiredSkills
           FROM jobs
           WHERE run_id = ?
           ORDER BY rowid ASC`,
        )
        .all(request.runId);

      if (jobs.length === 0) {
        // Stay silent — another agent instance may have this runId
        return;
      }

      await connection.invoke("JobsResponse", request.requestId, jobs);
    } catch (error) {
      console.error("[agent] FetchJobs error:", error);
    } finally {
      db.close();
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
