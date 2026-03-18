export class JoraBrowserSource {
    name = "jora";
    async discoverJobs(_request) {
        throw new Error("Jora browser discovery is planned but not implemented yet.");
    }
}
