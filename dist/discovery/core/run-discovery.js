export async function runDiscovery(options) {
    return {
        jobs: [],
        sources: options.sources ?? [],
    };
}
