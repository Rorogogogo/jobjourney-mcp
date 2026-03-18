export function normalizeDiscoveryJob(job) {
    return {
        ...job,
        title: job.title.trim(),
        company: job.company.trim(),
        location: job.location.trim(),
        description: job.description.trim(),
    };
}
