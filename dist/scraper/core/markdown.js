export function renderMarkdownReport(jobs) {
    if (jobs.length === 0) {
        return "# Job Results\n\nNo jobs found.";
    }
    const sections = jobs.map((job) => {
        const lines = [
            `## ${job.title} — ${job.location}`,
            "",
            `- Company: ${job.company}`,
            `- Location: ${job.location}`,
            `- Link: ${job.url}`,
            `- Source: ${job.source}`,
        ];
        if (job.salary)
            lines.push(`- Salary: ${job.salary}`);
        if (job.jobType)
            lines.push(`- Type: ${job.jobType}`);
        if (job.workplaceType)
            lines.push(`- Workplace: ${job.workplaceType}`);
        if (job.postedDate)
            lines.push(`- Posted: ${job.postedDate}`);
        if (job.applicantCount)
            lines.push(`- Applicants: ${job.applicantCount}`);
        if (job.isAlreadyApplied)
            lines.push(`- Status: Already Applied`);
        if (job.description) {
            const truncated = job.description.length > 500
                ? job.description.substring(0, 500) + "..."
                : job.description;
            lines.push("", "**Description:**", truncated);
        }
        return lines.join("\n");
    });
    return [`# Job Results (${jobs.length} jobs)`, "", ...sections].join("\n\n");
}
