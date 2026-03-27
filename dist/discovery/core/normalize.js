export function normalizeDiscoveryJob(job) {
    return {
        ...job,
        title: job.title.trim(),
        company: job.company.trim(),
        location: job.location.trim(),
        description: job.description.trim(),
    };
}
/**
 * Normalize a string for fuzzy dedup comparison:
 * lowercase, collapse whitespace, strip common suffixes and punctuation.
 */
export function normalizeForDedup(value) {
    return value
        .toLowerCase()
        .replace(/['']/g, "'")
        .replace(/\b(pty\.?\s*ltd\.?|ltd\.?|inc\.?|corp\.?|llc\.?|limited|group|holdings|australia|au)\b/gi, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
/**
 * Build a cross-platform dedup key from normalized company + title.
 * This allows detecting the same job posted on different platforms.
 */
export function crossPlatformDedupKey(job) {
    const company = normalizeForDedup(job.company);
    const title = normalizeForDedup(job.title);
    return `${company}||${title}`;
}
/**
 * Count how many non-empty "richness" fields a job has.
 * Used to pick the best version when deduplicating.
 */
export function jobRichness(job) {
    let score = 0;
    if (job.description)
        score += 2;
    if (job.salary || job.salaryRaw)
        score++;
    if (job.externalUrl)
        score++;
    if (job.jobType)
        score++;
    if (job.workArrangement)
        score++;
    if (job.companyLogoUrl)
        score++;
    if (job.requiredSkills)
        score++;
    if (job.techStack && job.techStack !== "[]")
        score++;
    if (job.experienceLevel)
        score++;
    if (job.postedAt)
        score++;
    return score;
}
